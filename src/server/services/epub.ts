import JSZip from "jszip";

export interface EpubMetadata {
  title?: string;
  author?: string;
  description?: string;
  language?: string;
  publisher?: string;
  isbn?: string;
  coverImage?: Buffer;
}

export async function extractEpubMetadata(
  buffer: Buffer,
): Promise<EpubMetadata> {
  const zip = await JSZip.loadAsync(buffer);

  // Find the OPF file (content.opf or similar)
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) return {};

  // Parse rootfile path from container.xml
  const rootfileMatch = containerXml.match(/rootfile[^>]+full-path="([^"]+)"/);
  if (!rootfileMatch) return {};

  const opfPath = rootfileMatch[1];
  const opfContent = await zip.file(opfPath)?.async("text");
  if (!opfContent) return {};

  const metadata: EpubMetadata = {};

  // Extract basic metadata from OPF
  metadata.title = extractTag(opfContent, "dc:title");
  metadata.author = extractTag(opfContent, "dc:creator") ?? undefined;
  metadata.description = extractTag(opfContent, "dc:description") ?? undefined;
  metadata.language = extractTag(opfContent, "dc:language") ?? undefined;
  metadata.publisher = extractTag(opfContent, "dc:publisher") ?? undefined;

  // Try to find ISBN in identifiers
  // Match identifiers with their attributes (scheme, id, etc.)
  const identifierRegex =
    /<dc:identifier([^>]*)>([^<]+)<\/dc:identifier>/g;
  let idMatch: RegExpExecArray | null;
  while ((idMatch = identifierRegex.exec(opfContent)) !== null) {
    const attrs = idMatch[1];
    const value = idMatch[2].trim();
    const stripped = value.replace(/-/g, "");

    // Check if it's explicitly marked as ISBN
    const isIsbnScheme =
      /scheme="ISBN"/i.test(attrs) ||
      /opf:scheme="ISBN"/i.test(attrs) ||
      /id="ISBN"/i.test(attrs) ||
      /id="isbn"/i.test(attrs);

    // Check for ISBN pattern (ISBN-10 or ISBN-13)
    const isIsbnPattern = /^(97[89])?\d{9}[\dXx]$/.test(stripped);

    // Also check for urn:isbn: prefix
    const urnMatch = value.match(/^urn:isbn:(.+)$/i);

    if (urnMatch) {
      metadata.isbn = urnMatch[1];
      break;
    } else if (isIsbnScheme || isIsbnPattern) {
      metadata.isbn = stripped;
      break;
    }
  }

  // Try to extract cover image
  const coverMeta = opfContent.match(
    /meta[^>]+name="cover"[^>]+content="([^"]+)"/,
  );
  const coverId = coverMeta?.[1];

  if (coverId) {
    // Find the item with this id
    const itemMatch = opfContent.match(
      new RegExp(`item[^>]+id="${coverId}"[^>]+href="([^"]+)"`),
    );
    if (itemMatch) {
      const coverHref = itemMatch[1];
      // Resolve path relative to OPF file
      const opfDir = opfPath.includes("/")
        ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
        : "";
      const coverPath = opfDir + coverHref;

      const coverFile = zip.file(coverPath);
      if (coverFile) {
        const coverBuffer = await coverFile.async("nodebuffer");
        metadata.coverImage = coverBuffer;
      }
    }
  }

  // If no cover found via meta, try common paths
  if (!metadata.coverImage) {
    const commonCoverPaths = [
      "cover.jpg",
      "cover.jpeg",
      "cover.png",
      "images/cover.jpg",
      "Images/cover.jpg",
      "OEBPS/images/cover.jpg",
      "OEBPS/Images/cover.jpg",
    ];

    for (const cp of commonCoverPaths) {
      const file = zip.file(cp);
      if (file) {
        metadata.coverImage = await file.async("nodebuffer");
        break;
      }
    }
  }

  return metadata;
}

function extractTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`));
  return match?.[1]?.trim();
}
