const ISBN_MARKER_PATTERN =
  /(?:urn:isbn:|isbn(?:-1[03])?:?\s*)([0-9Xx][0-9Xx\s-]{8,20})/gi;
const ISBN_FALLBACK_PATTERN =
  /\b(?:97[89][0-9\s-]{9,17}|[0-9][0-9\s-]{8,14}[0-9Xx])\b/g;

export function normalizeIsbn(value: string | null | undefined): string | null {
  if (!value) return null;

  const cleaned = value
    .replace(/urn:isbn:/gi, "")
    .replace(/isbn(?:-1[03])?:?/gi, "")
    .toUpperCase()
    .replace(/[^0-9X]/g, "");

  if (cleaned.length === 13) {
    return isValidIsbn13(cleaned) ? cleaned : null;
  }

  if (cleaned.length === 10) {
    return isValidIsbn10(cleaned) ? toIsbn13(cleaned) : null;
  }

  return null;
}

export function toIsbn10(isbn13: string): string | null {
  const normalized = normalizeIsbn(isbn13);
  if (!normalized || !normalized.startsWith("978")) return null;

  const body = normalized.slice(3, 12);
  const checkDigit = computeIsbn10CheckDigit(body);
  return `${body}${checkDigit}`;
}

export function extractIsbnCandidates(text: string): string[] {
  if (!text) return [];

  const result = new Set<string>();

  for (const match of text.matchAll(ISBN_MARKER_PATTERN)) {
    const normalized = normalizeIsbn(match[1]);
    if (normalized) result.add(normalized);
  }

  for (const match of text.matchAll(ISBN_FALLBACK_PATTERN)) {
    const normalized = normalizeIsbn(match[0]);
    if (normalized) result.add(normalized);
  }

  return [...result];
}

export function collectIsbnCandidates(
  ...values: Array<string | null | undefined>
): string[] {
  const result = new Set<string>();

  for (const value of values) {
    if (!value) continue;

    const direct = normalizeIsbn(value);
    if (direct) {
      result.add(direct);
    }

    for (const candidate of extractIsbnCandidates(value)) {
      result.add(candidate);
    }
  }

  return [...result];
}

function toIsbn13(isbn10: string): string {
  const body = `978${isbn10.slice(0, 9)}`;
  return `${body}${computeIsbn13CheckDigit(body)}`;
}

function isValidIsbn13(isbn13: string): boolean {
  if (!/^\d{13}$/.test(isbn13)) return false;

  const body = isbn13.slice(0, 12);
  return computeIsbn13CheckDigit(body) === isbn13[12];
}

function isValidIsbn10(isbn10: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn10)) return false;

  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const char = isbn10[i];
    const value = char === "X" ? 10 : Number.parseInt(char, 10);
    sum += value * (10 - i);
  }

  return sum % 11 === 0;
}

function computeIsbn13CheckDigit(first12Digits: string): string {
  let sum = 0;
  for (let i = 0; i < first12Digits.length; i += 1) {
    const digit = Number.parseInt(first12Digits[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const check = (10 - (sum % 10)) % 10;
  return String(check);
}

function computeIsbn10CheckDigit(first9Digits: string): string {
  let sum = 0;
  for (let i = 0; i < first9Digits.length; i += 1) {
    const digit = Number.parseInt(first9Digits[i], 10);
    sum += digit * (10 - i);
  }

  const check = (11 - (sum % 11)) % 11;
  return check === 10 ? "X" : String(check);
}
