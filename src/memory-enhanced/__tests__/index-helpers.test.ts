import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureMemoryDirectory, defaultMemoryDir } from '../index.js';

describe('Index Module Helper Functions', () => {
  describe('ensureMemoryDirectory', () => {
    let testDirPath: string;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      // Save original environment
      originalEnv = { ...process.env };
      testDirPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        `test-memory-dir-${Date.now()}`
      );
    });

    afterEach(async () => {
      // Restore original environment
      process.env = originalEnv;
      
      // Clean up test directory
      try {
        const files = await fs.readdir(testDirPath);
        await Promise.all(files.map(f => fs.unlink(path.join(testDirPath, f))));
        await fs.rmdir(testDirPath);
      } catch (error) {
        // Ignore errors if directory doesn't exist
      }
    });

    it('should use default memory directory when MEMORY_DIR_PATH is not set', async () => {
      delete process.env.MEMORY_DIR_PATH;
      
      const memoryDir = await ensureMemoryDirectory();
      
      expect(memoryDir).toBe(defaultMemoryDir);
    });

    it('should create directory if it does not exist', async () => {
      process.env.MEMORY_DIR_PATH = testDirPath;
      
      // Ensure directory doesn't exist
      try {
        await fs.rmdir(testDirPath);
      } catch (error) {
        // Ignore if doesn't exist
      }

      const memoryDir = await ensureMemoryDirectory();
      
      expect(memoryDir).toBe(testDirPath);
      
      // Verify directory was created
      const stats = await fs.stat(testDirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should use absolute path when MEMORY_DIR_PATH is absolute', async () => {
      const absolutePath = path.resolve(testDirPath);
      process.env.MEMORY_DIR_PATH = absolutePath;
      
      const memoryDir = await ensureMemoryDirectory();
      
      expect(memoryDir).toBe(absolutePath);
      expect(path.isAbsolute(memoryDir)).toBe(true);
    });

    it('should resolve relative path from module directory', async () => {
      const relativePath = 'test-relative-dir';
      process.env.MEMORY_DIR_PATH = relativePath;
      
      const memoryDir = await ensureMemoryDirectory();
      
      expect(path.isAbsolute(memoryDir)).toBe(true);
      expect(memoryDir).toContain(relativePath);
    });

    it('should not throw error if directory already exists', async () => {
      process.env.MEMORY_DIR_PATH = testDirPath;
      
      // Create directory first
      await fs.mkdir(testDirPath, { recursive: true });
      
      // Should not throw when calling again
      const memoryDir = await ensureMemoryDirectory();
      
      expect(memoryDir).toBe(testDirPath);
      
      // Verify directory still exists
      const stats = await fs.stat(testDirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create nested directories recursively', async () => {
      const nestedPath = path.join(testDirPath, 'nested', 'deep', 'path');
      process.env.MEMORY_DIR_PATH = nestedPath;
      
      const memoryDir = await ensureMemoryDirectory();
      
      expect(memoryDir).toBe(nestedPath);
      
      // Verify all nested directories were created
      const stats = await fs.stat(nestedPath);
      expect(stats.isDirectory()).toBe(true);
      
      // Clean up nested directories
      await fs.rmdir(path.join(testDirPath, 'nested', 'deep', 'path'));
      await fs.rmdir(path.join(testDirPath, 'nested', 'deep'));
      await fs.rmdir(path.join(testDirPath, 'nested'));
    });

    it('should handle paths with special characters', async () => {
      const specialPath = path.join(testDirPath, 'test-dir_with.special$chars');
      process.env.MEMORY_DIR_PATH = specialPath;
      
      const memoryDir = await ensureMemoryDirectory();
      
      expect(memoryDir).toBe(specialPath);
      
      // Verify directory was created
      const stats = await fs.stat(specialPath);
      expect(stats.isDirectory()).toBe(true);
      
      // Clean up
      await fs.rmdir(specialPath);
    });

    it('should return consistent path on multiple calls', async () => {
      process.env.MEMORY_DIR_PATH = testDirPath;
      
      const memoryDir1 = await ensureMemoryDirectory();
      const memoryDir2 = await ensureMemoryDirectory();
      const memoryDir3 = await ensureMemoryDirectory();
      
      expect(memoryDir1).toBe(memoryDir2);
      expect(memoryDir2).toBe(memoryDir3);
      expect(memoryDir1).toBe(testDirPath);
    });

    it('should handle empty string as MEMORY_DIR_PATH', async () => {
      process.env.MEMORY_DIR_PATH = '';
      
      const memoryDir = await ensureMemoryDirectory();
      
      // Should use default when empty
      expect(memoryDir).toBe(defaultMemoryDir);
    });
  });

  describe('Storage Directory Behavior', () => {
    let testDirPath: string;

    beforeEach(() => {
      testDirPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        `test-storage-dir-${Date.now()}`
      );
    });

    afterEach(async () => {
      // Clean up test directory
      try {
        const files = await fs.readdir(testDirPath);
        await Promise.all(files.map(f => fs.unlink(path.join(testDirPath, f))));
        await fs.rmdir(testDirPath);
      } catch (error) {
        // Ignore errors if directory doesn't exist
      }
    });

    it('should allow file creation in ensured directory', async () => {
      process.env.MEMORY_DIR_PATH = testDirPath;
      
      const memoryDir = await ensureMemoryDirectory();
      const testFile = path.join(memoryDir, 'test-file.txt');
      
      // Create a test file
      await fs.writeFile(testFile, 'test content');
      
      // Verify file exists
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('test content');
      
      // Clean up
      await fs.unlink(testFile);
    });

    it('should preserve existing files in directory', async () => {
      process.env.MEMORY_DIR_PATH = testDirPath;
      
      // Create directory and file manually
      await fs.mkdir(testDirPath, { recursive: true });
      const existingFile = path.join(testDirPath, 'existing-file.txt');
      await fs.writeFile(existingFile, 'existing content');
      
      // Ensure directory (should not affect existing file)
      await ensureMemoryDirectory();
      
      // Verify existing file is still there
      const content = await fs.readFile(existingFile, 'utf-8');
      expect(content).toBe('existing content');
      
      // Clean up
      await fs.unlink(existingFile);
    });
  });
});
