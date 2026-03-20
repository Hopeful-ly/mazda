import path from "node:path";
import JSZip from "jszip";
import { chooseBestCover } from "@/server/services/cover";
import { collectIsbnCandidates } from "@/server/services/isbn";

export interface EpubMetadata {
  title?: string;
  author?: string;
  description?: string;
  language?: string;
  publisher?: string;
  isbn?: string;
  isbnCandidates?: string[];
  coverImage?: Buffer;
}

export async function extractEpubMetadata(
  buffer: Buffer,
): Promise<EpubMetadata> {
  try {
    const zip = await JSZip.loadAsync(buffer);

    const opfPath = await findOpfPath(zip);
    if (!opfPath) return {};

    const opfContent = await zip.file(opfPath)?.async("text");
    if (!opfContent) return {};

    const metadata: EpubMetadata = {
      title: extractFirstTag(opfContent, ["dc:title", "title"]),
      author: extractFirstTag(opfContent, ["dc:creator", "creator"]),
      description: extractFirstTag(opfContent, [
        "dc:description",
        "description",
      ]),
      language: extractFirstTag(opfContent, ["dc:language", "language"]),
      publisher: extractFirstTag(opfContent, ["dc:publisher", "publisher"]),
    };

    const isbnCandidates = extractIsbnCandidates(opfContent);
    metadata.isbnCandidates = isbnCandidates;
    metadata.isbn = isbnCandidates[0];

    const coverImage = await extractBestCover(zip, opfPath, opfContent);
    if (coverImage) {
      metadata.coverImage = coverImage;
    }

    return metadata;
  } catch {
    return {};
  }
}

function extractTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`));
  return match?.[1]?.trim();
}

async function findOpfPath(zip: JSZip): Promise<string | null> {
  const containerFile =
    zip.file("META-INF/container.xml") ??
    findZipFileCaseInsensitive(zip, "META-INF/container.xml");

  if (containerFile) {
    const containerXml = await containerFile.async("text");
    const rootfileMatch = containerXml.match(
      /rootfile[^>]+full-path\s*=\s*["']([^"']+)["']/i,
    );

    if (rootfileMatch?.[1]) {
      return decodeXml(rootfileMatch[1]);
    }
  }

  const fallbackOpf = Object.values(zip.files)
    .filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".opf"))
    .sort((a, b) => a.name.length - b.name.length)[0];

  return fallbackOpf?.name ?? null;
}

function extractFirstTag(xml: string, tagNames: string[]): string | undefined {
  for (const tagName of tagNames) {
    const found = extractTag(xml, tagName);
    if (found) {
      const decoded = cleanXmlText(found);
      if (decoded) return decoded;
    }
  }

  return undefined;
}

function extractIsbnCandidates(opfContent: string): string[] {
  const candidates = new Set<string>();

  const identifierRegex =
    /<(?:dc:)?identifier([^>]*)>([\s\S]*?)<\/(?:dc:)?identifier>/gi;
  for (const match of opfContent.matchAll(identifierRegex)) {
    const attrs = match[1] ?? "";
    const value = cleanXmlText(match[2] ?? "") ?? "";
    for (const candidate of collectIsbnCandidates(value, attrs)) {
      candidates.add(candidate);
    }
  }

  for (const candidate of collectIsbnCandidates(opfContent)) {
    candidates.add(candidate);
  }

  return [...candidates];
}

interface ManifestItem {
  id?: string;
  href?: string;
  mediaType?: string;
  properties?: string;
}

async function extractBestCover(
  zip: JSZip,
  opfPath: string,
  opfContent: string,
): Promise<Buffer | undefined> {
  const manifestItems = parseManifestItems(opfContent);
  if (manifestItems.length === 0) {
    return undefined;
  }

  const coverIds = extractCoverIds(opfContent);
  const guideCoverHrefs = extractGuideCoverHrefs(opfContent);

  const scoredItems = manifestItems
    .filter((item) => item.href && isImageItem(item))
    .map((item) => ({ item, score: scoreManifestItem(item, coverIds) }))
    .sort((a, b) => b.score - a.score);

  const coverCandidates: Array<{ label: string; buffer: Buffer }> = [];
  const visitedPaths = new Set<string>();

  const hrefsByPriority = [
    ...guideCoverHrefs,
    ...scoredItems.map(({ item }) => item.href ?? ""),
  ].filter(Boolean);

  for (const href of hrefsByPriority) {
    const resolvedPath = resolveZipRelativePath(opfPath, href);
    if (!resolvedPath || visitedPaths.has(resolvedPath)) continue;
    visitedPaths.add(resolvedPath);

    const file =
      zip.file(resolvedPath) ?? findZipFileCaseInsensitive(zip, resolvedPath);
    if (!file || file.dir) continue;

    try {
      const buffer = await file.async("nodebuffer");
      coverCandidates.push({ label: resolvedPath, buffer });
    } catch {
      // Skip unreadable entries
    }
  }

  if (coverCandidates.length === 0) {
    return undefined;
  }

  const best = await chooseBestCover(coverCandidates);
  return best?.buffer;
}

function parseManifestItems(opfContent: string): ManifestItem[] {
  const results: ManifestItem[] = [];
  const itemRegex = /<item\b([^>]*)\/?\s*>/gi;

  for (const match of opfContent.matchAll(itemRegex)) {
    const attrs = parseXmlAttributes(match[1] ?? "");
    results.push({
      id: attrs.id,
      href: attrs.href,
      mediaType: attrs["media-type"],
      properties: attrs.properties,
    });
  }

  return results;
}

function extractCoverIds(opfContent: string): Set<string> {
  const result = new Set<string>();

  const metaRegex = /<meta\b([^>]*)\/?\s*>/gi;
  for (const match of opfContent.matchAll(metaRegex)) {
    const attrs = parseXmlAttributes(match[1] ?? "");
    if (attrs.name?.toLowerCase() === "cover" && attrs.content) {
      result.add(attrs.content);
    }

    if (attrs.property?.toLowerCase() === "cover" && attrs.content) {
      result.add(attrs.content);
    }
  }

  return result;
}

function extractGuideCoverHrefs(opfContent: string): string[] {
  const result: string[] = [];
  const referenceRegex = /<reference\b([^>]*)\/?\s*>/gi;

  for (const match of opfContent.matchAll(referenceRegex)) {
    const attrs = parseXmlAttributes(match[1] ?? "");
    const type = attrs.type?.toLowerCase() ?? "";
    if (type.includes("cover") && attrs.href) {
      result.push(attrs.href);
    }
  }

  return result;
}

function parseXmlAttributes(value: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;

  for (const match of value.matchAll(attrRegex)) {
    const key = match[1].toLowerCase();
    const attrValue = decodeXml(match[3] ?? match[4] ?? "");
    attrs[key] = attrValue;
  }

  return attrs;
}

function resolveZipRelativePath(opfPath: string, href: string): string | null {
  const withoutFragment = href.split("#")[0]?.trim();
  if (!withoutFragment) return null;

  const normalizedHref = decodeXml(withoutFragment).replace(/\\/g, "/");
  const opfDir = path.posix.dirname(opfPath.replace(/\\/g, "/"));
  const joined = path.posix.normalize(path.posix.join(opfDir, normalizedHref));

  return joined.startsWith("../") ? null : joined;
}

function findZipFileCaseInsensitive(zip: JSZip, targetPath: string) {
  const normalizedTarget = targetPath.toLowerCase();
  return Object.values(zip.files).find(
    (entry) => entry.name.toLowerCase() === normalizedTarget,
  );
}

function isImageItem(item: ManifestItem): boolean {
  const mediaType = item.mediaType?.toLowerCase() ?? "";
  if (mediaType.startsWith("image/")) {
    return true;
  }

  const href = item.href?.toLowerCase() ?? "";
  return /(\.jpg|\.jpeg|\.png|\.webp|\.gif|\.avif|\.bmp)$/.test(href);
}

function scoreManifestItem(item: ManifestItem, coverIds: Set<string>): number {
  const id = item.id?.toLowerCase() ?? "";
  const href = item.href?.toLowerCase() ?? "";
  const properties = item.properties?.toLowerCase() ?? "";
  const mediaType = item.mediaType?.toLowerCase() ?? "";

  let score = 0;

  if (coverIds.has(item.id ?? "")) score += 10;
  if (properties.includes("cover-image")) score += 9;
  if (id.includes("cover")) score += 6;
  if (/cover|front|jacket|folder|titlepage/.test(href)) score += 6;
  if (mediaType.includes("jpeg") || mediaType.includes("png")) score += 2;
  if (href.includes("thumb") || href.includes("icon")) score -= 6;

  return score;
}

function cleanXmlText(value: string): string | undefined {
  const decoded = decodeXml(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return decoded || undefined;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
