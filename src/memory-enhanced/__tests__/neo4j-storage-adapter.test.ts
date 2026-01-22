import { describe, it, expect } from 'vitest';
import { Neo4jStorageAdapter } from '../lib/neo4j-storage-adapter.js';

/**
 * Unit tests for Neo4j Storage Adapter
 * These tests focus on code paths not covered by E2E tests
 */
describe('Neo4j Storage Adapter - Unit Tests', () => {
  describe('Constructor and Configuration', () => {
    it('should create adapter with valid config', () => {
      const config = {
        uri: 'neo4j://localhost:7687',
        username: 'neo4j',
        password: 'testpassword',
        database: 'testdb'
      };
      
      const adapter = new Neo4jStorageAdapter(config);
      expect(adapter).toBeDefined();
    });

    it('should create adapter without optional database parameter', () => {
      const config = {
        uri: 'neo4j://localhost:7687',
        username: 'neo4j',
        password: 'testpassword'
      };
      
      const adapter = new Neo4jStorageAdapter(config);
      expect(adapter).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when loading graph before initialization', async () => {
      const config = {
        uri: 'neo4j://localhost:7687',
        username: 'neo4j',
        password: 'testpassword'
      };
      
      const adapter = new Neo4jStorageAdapter(config);
      
      await expect(adapter.loadGraph()).rejects.toThrow();
    });

    it('should throw error when saving graph before initialization', async () => {
      const config = {
        uri: 'neo4j://localhost:7687',
        username: 'neo4j',
        password: 'testpassword'
      };
      
      const adapter = new Neo4jStorageAdapter(config);
      const graph = { entities: [], relations: [] };
      
      await expect(adapter.saveGraph(graph)).rejects.toThrow();
    });

    it('should handle close on uninitialized adapter gracefully', async () => {
      const config = {
        uri: 'neo4j://localhost:7687',
        username: 'neo4j',
        password: 'testpassword'
      };
      
      const adapter = new Neo4jStorageAdapter(config);
      
      // Should not throw
      await expect(adapter.close()).resolves.toBeUndefined();
    });

    it('should handle invalid connection in initialize', async () => {
      const config = {
        uri: 'neo4j://invalid-host:7687',
        username: 'neo4j',
        password: 'wrong'
      };
      
      const adapter = new Neo4jStorageAdapter(config);
      
      await expect(adapter.initialize()).rejects.toThrow(/Failed to initialize Neo4j connection/);
    });
  });
});
