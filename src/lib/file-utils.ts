// src/lib/file-utils.ts

import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

/**
 * Ensure directory exists, create it if it doesn't
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

/**
 * Write data to file in YAML format
 */
export async function writeYamlFile(filePath: string, data: any): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const yamlContent = yaml.dump(data, {
    indent: 2,
    lineWidth: -1, // Don't wrap lines
    noRefs: true, // Don't use references
    sortKeys: true,
    quotingType: '"',
    // forceQuotes: true,
  });

  await fs.promises.writeFile(filePath, yamlContent, 'utf-8');
}

/**
 * Read data from YAML file
 */
export async function readYamlFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return yaml.load(content) as T;
  } catch (error) {
    return null;
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
