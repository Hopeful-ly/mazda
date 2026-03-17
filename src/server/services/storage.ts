import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const BOOKS_DIR = process.env.BOOKS_STORAGE_PATH ?? "./data/books";
const COVERS_DIR = process.env.COVERS_STORAGE_PATH ?? "./data/covers";

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export async function saveBook(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  await ensureDir(BOOKS_DIR);
  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = path.join(BOOKS_DIR, safeName);
  await writeFile(filePath, buffer);
  return safeName;
}

export async function saveCover(
  buffer: Buffer,
  bookId: string,
): Promise<string> {
  await ensureDir(COVERS_DIR);
  const filename = `${bookId}.jpg`;
  const filePath = path.join(COVERS_DIR, filename);
  await writeFile(filePath, buffer);
  return filename;
}

export async function getBookPath(filename: string): Promise<string> {
  return path.resolve(BOOKS_DIR, filename);
}

export async function getCoverPath(filename: string): Promise<string> {
  return path.resolve(COVERS_DIR, filename);
}

export async function readBookFile(filename: string): Promise<Buffer> {
  const filePath = path.resolve(BOOKS_DIR, filename);
  return readFile(filePath);
}

export async function readCoverFile(filename: string): Promise<Buffer> {
  const filePath = path.resolve(COVERS_DIR, filename);
  return readFile(filePath);
}

export async function deleteBookFile(filename: string): Promise<void> {
  const filePath = path.resolve(BOOKS_DIR, filename);
  try {
    await unlink(filePath);
  } catch {
    // File may not exist
  }
}

export async function deleteCoverFile(filename: string): Promise<void> {
  const filePath = path.resolve(COVERS_DIR, filename);
  try {
    await unlink(filePath);
  } catch {
    // File may not exist
  }
}
