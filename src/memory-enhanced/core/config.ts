import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Define memory directory path using environment variable with fallback
export const defaultMemoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'memory-data');

export async function ensureMemoryDirectory(): Promise<string> {
  const memoryDir = process.env.MEMORY_DIR_PATH 
    ? (path.isAbsolute(process.env.MEMORY_DIR_PATH)
        ? process.env.MEMORY_DIR_PATH
        : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', process.env.MEMORY_DIR_PATH))
    : defaultMemoryDir;
  
  // Ensure directory exists
  try {
    await fs.mkdir(memoryDir, { recursive: true });
  } catch (error) {
    // Ignore error if directory already exists
  }
  
  return memoryDir;
}
