import sharp from "sharp";

const MAX_COVER_WIDTH = 1600;
const MAX_COVER_HEIGHT = 2400;
const MIN_COVER_WIDTH = 120;
const MIN_COVER_HEIGHT = 120;
const MIN_COVER_AREA = 20_000;

export interface CoverCandidate {
  label: string;
  buffer: Buffer;
}

interface AnalyzedCover {
  label: string;
  buffer: Buffer;
  width: number;
  height: number;
  score: number;
}

export async function normalizeCoverBuffer(
  buffer: Buffer,
): Promise<Buffer | null> {
  const analyzed = await analyzeCoverBuffer({ label: "cover", buffer });
  return analyzed?.buffer ?? null;
}

export async function chooseBestCover(
  candidates: CoverCandidate[],
): Promise<CoverCandidate | null> {
  const analyzedCandidates = await Promise.all(
    candidates.map((candidate) => analyzeCoverBuffer(candidate)),
  );

  const usable = analyzedCandidates.filter(
    (candidate): candidate is AnalyzedCover => candidate !== null,
  );

  if (usable.length === 0) {
    return null;
  }

  usable.sort((a, b) => b.score - a.score);
  return {
    label: usable[0].label,
    buffer: usable[0].buffer,
  };
}

async function analyzeCoverBuffer(
  candidate: CoverCandidate,
): Promise<AnalyzedCover | null> {
  try {
    const pipeline = sharp(candidate.buffer, {
      failOn: "none",
      limitInputPixels: 64_000_000,
    }).rotate();

    const meta = await pipeline.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    if (!isUsableDimensions(width, height)) {
      return null;
    }

    const normalizedBuffer = await pipeline
      .resize({
        width: MAX_COVER_WIDTH,
        height: MAX_COVER_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    const score = scoreDimensions(width, height);
    return {
      label: candidate.label,
      buffer: normalizedBuffer,
      width,
      height,
      score,
    };
  } catch {
    return null;
  }
}

function isUsableDimensions(width: number, height: number): boolean {
  return (
    width >= MIN_COVER_WIDTH &&
    height >= MIN_COVER_HEIGHT &&
    width * height >= MIN_COVER_AREA
  );
}

function scoreDimensions(width: number, height: number): number {
  const area = width * height;
  const aspectRatio = width / height;

  const areaScore = Math.min(1, area / (900 * 1400));
  const aspectTarget = 2 / 3;
  const aspectDelta = Math.abs(aspectRatio - aspectTarget);
  const aspectScore = Math.max(0, 1 - aspectDelta * 1.7);

  const portraitBonus = aspectRatio <= 1 ? 0.15 : -0.2;

  return areaScore * 0.65 + aspectScore * 0.35 + portraitBonus;
}
