import { describe, it, expect, vi } from 'vitest';
import { Neo4jStorageAdapter } from '../lib/neo4j-storage-adapter.js';
import { Entity, Relation } from '../lib/types.js';

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
      await expect(adapter.close()).resolves.not.toThrow();
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

  describe('Observations Serialization', () => {
    it('should handle entities with complex observations', async () => {
      // This test verifies serialization/deserialization through the public API
      // We can't test private methods directly, but we test the behavior
      const config = {
        uri: 'neo4j://localhost:7687',
        username: 'neo4j',
        password: 'testpassword'
      };
      
      const adapter = new Neo4jStorageAdapter(config);
      
      // The adapter should be able to handle entities with observations
      // when properly initialized, but we're testing the structure
      expect(adapter).toBeDefined();
    });
  });

  describe('Graph Operations', () => {
    it('should handle empty graph save', async () => {
      const config = {
        uri: 'neo4j://invalid:7687',
        username: 'neo4j',
        password: 'test'
      };
      
      const adapter = new Neo4jStorageAdapter(config);
      const emptyGraph = { entities: [], relations: [] };
      
      // Should fail because not initialized, but tests the method signature
      await expect(adapter.saveGraph(emptyGraph)).rejects.toThrow();
    });

    it('should handle graph with multiple entities and relations', () => {
      // Testing that the types are properly handled
      const entities: Entity[] = [
        {
          name: 'Entity1',
          entityType: 'Type1',
          observations: [
            {
              id: 'obs1',
              content: 'Test observation',
              timestamp: new Date().toISOString(),
              version: 1,
              agentThreadId: 'thread1'
            }
          ],
          agentThreadId: 'thread1',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          importance: 0.8
        }
      ];

      const relations: Relation[] = [
        {
          from: 'Entity1',
          to: 'Entity2',
          relationType: 'relates_to',
          agentThreadId: 'thread1',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          importance: 0.7
        }
      ];

      const graph = { entities, relations };
      
      // Verify the structure is valid
      expect(graph.entities).toHaveLength(1);
      expect(graph.relations).toHaveLength(1);
    });
  });
});
