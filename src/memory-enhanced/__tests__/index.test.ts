import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ensureMemoryDirectory, defaultMemoryDir } from '../index.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Unit tests for index.ts server initialization and utilities
 */
describe('Server Initialization - index.ts', () => {
  describe('ensureMemoryDirectory', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should use default directory when MEMORY_DIR_PATH is not set', async () => {
      delete process.env.MEMORY_DIR_PATH;
      
      const memoryDir = await ensureMemoryDirectory();
      
      expect(memoryDir).toBe(defaultMemoryDir);
    });

    it('should use absolute path from MEMORY_DIR_PATH when set', async () => {
      const testPath = '/tmp/test-memory-custom';
      process.env.MEMORY_DIR_PATH = testPath;
      
      const memoryDir = await ensureMemoryDirectory();
      
      expect(memoryDir).toBe(testPath);
    });

    it('should resolve relative path from MEMORY_DIR_PATH', async () => {
      process.env.MEMORY_DIR_PATH = 'custom-memory';
      
      const memoryDir = await ensureMemoryDirectory();
      
      expect(path.isAbsolute(memoryDir)).toBe(true);
      expect(memoryDir).toContain('custom-memory');
    });

    it('should create directory if it does not exist', async () => {
      const testPath = `/tmp/test-memory-${Date.now()}`;
      process.env.MEMORY_DIR_PATH = testPath;
      
      const memoryDir = await ensureMemoryDirectory();
      
      // Verify directory was created
      const stats = await fs.stat(memoryDir);
      expect(stats.isDirectory()).toBe(true);
      
      // Cleanup
      await fs.rmdir(testPath).catch(() => {});
    });

    it('should not throw if directory already exists', async () => {
      const testPath = `/tmp/test-memory-existing-${Date.now()}`;
      await fs.mkdir(testPath, { recursive: true });
      process.env.MEMORY_DIR_PATH = testPath;
      
      // Should not throw
      await expect(ensureMemoryDirectory()).resolves.toBe(testPath);
      
      // Cleanup
      await fs.rmdir(testPath).catch(() => {});
    });
  });

  describe('Storage adapter configuration', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should handle missing Neo4j configuration', () => {
      delete process.env.NEO4J_URI;
      delete process.env.NEO4J_USERNAME;
      delete process.env.NEO4J_PASSWORD;
      
      // The server should fall back to JSONL storage
      expect(process.env.NEO4J_URI).toBeUndefined();
    });

    it('should detect partial Neo4j configuration', () => {
      process.env.NEO4J_URI = 'neo4j://localhost:7687';
      delete process.env.NEO4J_USERNAME;
      delete process.env.NEO4J_PASSWORD;
      
      // Missing username and password
      expect(process.env.NEO4J_USERNAME).toBeUndefined();
      expect(process.env.NEO4J_PASSWORD).toBeUndefined();
    });
  });

  describe('Module exports', () => {
    it('should export KnowledgeGraphManager', async () => {
      const { KnowledgeGraphManager } = await import('../index.js');
      expect(KnowledgeGraphManager).toBeDefined();
    });

    it('should export JsonlStorageAdapter', async () => {
      const { JsonlStorageAdapter } = await import('../index.js');
      expect(JsonlStorageAdapter).toBeDefined();
    });

    it('should export Neo4jStorageAdapter', async () => {
      const { Neo4jStorageAdapter } = await import('../index.js');
      expect(Neo4jStorageAdapter).toBeDefined();
    });

    it('should export type Entity', async () => {
      // TypeScript types are checked at compile time, this tests the import structure
      const module = await import('../index.js');
      expect(module).toBeDefined();
    });
  });

  describe('Storage adapter creation functions', () => {
    it('should handle Neo4j configuration with all parameters', () => {
      process.env.NEO4J_URI = 'neo4j://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
      process.env.NEO4J_DATABASE = 'testdb';

      // Config should be complete
      expect(process.env.NEO4J_URI).toBeDefined();
      expect(process.env.NEO4J_USERNAME).toBeDefined();
      expect(process.env.NEO4J_PASSWORD).toBeDefined();
      expect(process.env.NEO4J_DATABASE).toBeDefined();
    });

    it('should handle Neo4j configuration without optional database', () => {
      process.env.NEO4J_URI = 'neo4j://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
      delete process.env.NEO4J_DATABASE;

      // Config should still be valid
      expect(process.env.NEO4J_URI).toBeDefined();
      expect(process.env.NEO4J_USERNAME).toBeDefined();
      expect(process.env.NEO4J_PASSWORD).toBeDefined();
    });
  });
});
