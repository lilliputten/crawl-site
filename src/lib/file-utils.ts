// src/lib/file-utils.ts

import * as fs from 'fs';
import * as path from 'path';

/**
 * Ensure directory exists, create if it doesn't
 */
export async function ensureDir(dirPath: string): Promise<void> {
  if (!fs.existsSync(dirPath)) {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Save content to file
 */
export async function saveFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.promises.writeFile(filePath, content, 'utf-8');
}

/**
 * Read file content
 */
export async function readFile(filePath: string): Promise<string> {
  return await fs.promises.readFile(filePath, 'utf-8');
}

/**
 * Check if file exists
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Delete file if it exists
 */
export async function deleteFile(filePath: string): Promise<void> {
  if (fileExists(filePath)) {
    await fs.promises.unlink(filePath);
  }
}

/**
 * List all files in directory recursively
 */
export async function listFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];
  
  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await listFiles(fullPath);
      files.push(...subFiles);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Get file stats
 */
export async function getFileStats(filePath: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.stat(filePath);
  } catch {
    return null;
  }
}
