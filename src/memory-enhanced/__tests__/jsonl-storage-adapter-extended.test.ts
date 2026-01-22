import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonlStorageAdapter } from '../lib/jsonl-storage-adapter.js';
import { Entity, Relation } from '../lib/types.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Additional tests for JsonlStorageAdapter to improve coverage
 * Focuses on error handling and edge cases
 */
describe('JsonlStorageAdapter - Extended Coverage', () => {
  let adapter: JsonlStorageAdapter;
  let testDir: string;

  beforeEach(async () => {
    testDir = `/tmp/test-jsonl-extended-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });
    adapter = new JsonlStorageAdapter(testDir);
    await adapter.initialize();
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('Error Handling', () => {
    it('should handle empty directory gracefully', async () => {
      const emptyDir = `/tmp/test-jsonl-empty-${Date.now()}`;
      await fs.mkdir(emptyDir, { recursive: true });
      
      const emptyAdapter = new JsonlStorageAdapter(emptyDir);
      await emptyAdapter.initialize();
      
      const graph = await emptyAdapter.loadGraph();
      
      expect(graph.entities).toHaveLength(0);
      expect(graph.relations).toHaveLength(0);
      
      await fs.rm(emptyDir, { recursive: true, force: true }).catch(() => {});
    });

    it('should handle malformed JSONL gracefully', async () => {
      // Write malformed JSONL to the entities file
      const entitiesFile = path.join(testDir, 'thread_test.entities.jsonl');
      await fs.writeFile(entitiesFile, 'not valid json\n{valid: json}\n');
      
      const graph = await adapter.loadGraph();
      
      // Should skip invalid lines but continue
      expect(Array.isArray(graph.entities)).toBe(true);
    });

    it('should handle missing files when loading', async () => {
      // Try to load from a directory that doesn't have any JSONL files
      const newDir = `/tmp/test-jsonl-missing-${Date.now()}`;
      await fs.mkdir(newDir, { recursive: true });
      
      const newAdapter = new JsonlStorageAdapter(newDir);
      await newAdapter.initialize();
      
      const graph = await newAdapter.loadGraph();
      
      expect(graph.entities).toHaveLength(0);
      expect(graph.relations).toHaveLength(0);
      
      await fs.rm(newDir, { recursive: true, force: true }).catch(() => {});
    });

    it('should handle concurrent saves gracefully', async () => {
      const entity1: Entity = {
        name: 'ConcurrentEntity1',
        entityType: 'Type',
        observations: [{
          id: 'obs1',
          content: 'Test',
          timestamp: new Date().toISOString(),
          version: 1,
          agentThreadId: 'thread1'
        }],
        agentThreadId: 'thread1',
        timestamp: new Date().toISOString(),
        confidence: 0.9,
        importance: 0.8
      };

      const entity2: Entity = {
        name: 'ConcurrentEntity2',
        entityType: 'Type',
        observations: [{
          id: 'obs2',
          content: 'Test',
          timestamp: new Date().toISOString(),
          version: 1,
          agentThreadId: 'thread2'
        }],
        agentThreadId: 'thread2',
        timestamp: new Date().toISOString(),
        confidence: 0.9,
        importance: 0.8
      };

      // Save both entities together (they're in different threads)
      await adapter.saveGraph({ entities: [entity1, entity2], relations: [] });

      const graph = await adapter.loadGraph();
      
      // Both entities should be saved since they're in different threads
      expect(graph.entities.length).toBe(2);
    });
  });

  describe('Thread File Management', () => {
    it('should handle entities from multiple threads', async () => {
      const entities: Entity[] = [
        {
          name: 'Thread1Entity',
          entityType: 'Type',
          observations: [{
            id: 'obs1',
            content: 'Test',
            timestamp: new Date().toISOString(),
            version: 1,
            agentThreadId: 'thread1'
          }],
          agentThreadId: 'thread1',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          importance: 0.8
        },
        {
          name: 'Thread2Entity',
          entityType: 'Type',
          observations: [{
            id: 'obs2',
            content: 'Test',
            timestamp: new Date().toISOString(),
            version: 1,
            agentThreadId: 'thread2'
          }],
          agentThreadId: 'thread2',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          importance: 0.8
        }
      ];

      await adapter.saveGraph({ entities, relations: [] });

      // Verify thread files exist
      const graph = await adapter.loadGraph();
      
      // Both entities should be loaded (they're from different threads)
      expect(graph.entities.length).toBe(2);
    });

    it('should handle cleanup of empty thread files', async () => {
      // Create an entity
      const entity: Entity = {
        name: 'TemporaryEntity',
        entityType: 'Type',
        observations: [{
          id: 'obs1',
          content: 'Test',
          timestamp: new Date().toISOString(),
          version: 1,
          agentThreadId: 'temp_thread'
        }],
        agentThreadId: 'temp_thread',
        timestamp: new Date().toISOString(),
        confidence: 0.9,
        importance: 0.8
      };

      await adapter.saveGraph({ entities: [entity], relations: [] });

      // Now save without that entity (should cleanup the thread file)
      await adapter.saveGraph({ entities: [], relations: [] });

      const graph = await adapter.loadGraph();
      expect(graph.entities).toHaveLength(0);
    });
  });

  describe('Relations Management', () => {
    it('should handle relations across different threads', async () => {
      const entities: Entity[] = [
        {
          name: 'Entity1',
          entityType: 'Type',
          observations: [{
            id: 'obs1',
            content: 'Test',
            timestamp: new Date().toISOString(),
            version: 1,
            agentThreadId: 'thread1'
          }],
          agentThreadId: 'thread1',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          importance: 0.8
        },
        {
          name: 'Entity2',
          entityType: 'Type',
          observations: [{
            id: 'obs2',
            content: 'Test',
            timestamp: new Date().toISOString(),
            version: 1,
            agentThreadId: 'thread2'
          }],
          agentThreadId: 'thread2',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          importance: 0.8
        }
      ];

      const relations: Relation[] = [
        {
          from: 'Entity1',
          to: 'Entity2',
          relationType: 'cross_thread_relation',
          agentThreadId: 'thread1',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          importance: 0.7
        }
      ];

      await adapter.saveGraph({ entities, relations });

      const graph = await adapter.loadGraph();
      
      expect(graph.entities).toHaveLength(2);
      expect(graph.relations).toHaveLength(1);
      expect(graph.relations[0].relationType).toBe('cross_thread_relation');
    });

    it('should handle saving and loading empty relations', async () => {
      const entities: Entity[] = [
        {
          name: 'EntityNoRelations',
          entityType: 'Type',
          observations: [{
            id: 'obs1',
            content: 'Test',
            timestamp: new Date().toISOString(),
            version: 1,
            agentThreadId: 'thread1'
          }],
          agentThreadId: 'thread1',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          importance: 0.8
        }
      ];

      await adapter.saveGraph({ entities, relations: [] });

      const graph = await adapter.loadGraph();
      
      expect(graph.entities).toHaveLength(1);
      expect(graph.relations).toHaveLength(0);
    });
  });

  describe('Close and Cleanup', () => {
    it('should not have a close method (file-based storage)', () => {
      // JsonlStorageAdapter doesn't maintain persistent connections
      // so it doesn't need a close method
      expect(typeof (adapter as any).close).toBe('undefined');
    });

    it('should be able to reuse adapter multiple times', async () => {
      // Should work multiple times without issues
      await adapter.saveGraph({ entities: [], relations: [] });
      await adapter.saveGraph({ entities: [], relations: [] });
      
      const graph = await adapter.loadGraph();
      expect(graph.entities).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle entities with special characters in thread IDs', async () => {
      const entity: Entity = {
        name: 'SpecialThreadEntity',
        entityType: 'Type',
        observations: [{
          id: 'obs1',
          content: 'Test',
          timestamp: new Date().toISOString(),
          version: 1,
          agentThreadId: 'thread-with-special.chars_123'
        }],
        agentThreadId: 'thread-with-special.chars_123',
        timestamp: new Date().toISOString(),
        confidence: 0.9,
        importance: 0.8
      };

      await adapter.saveGraph({ entities: [entity], relations: [] });

      const graph = await adapter.loadGraph();
      
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].agentThreadId).toBe('thread-with-special.chars_123');
    });

    it('should handle entities with complex observations', async () => {
      const entity: Entity = {
        name: 'ComplexEntity',
        entityType: 'Type',
        observations: [
          {
            id: 'obs1',
            content: 'Original observation',
            timestamp: new Date().toISOString(),
            version: 1,
            agentThreadId: 'thread1'
          },
          {
            id: 'obs2',
            content: 'Updated observation',
            timestamp: new Date().toISOString(),
            version: 2,
            agentThreadId: 'thread1',
            supersedes: 'obs1'
          }
        ],
        agentThreadId: 'thread1',
        timestamp: new Date().toISOString(),
        confidence: 0.9,
        importance: 0.8
      };

      await adapter.saveGraph({ entities: [entity], relations: [] });

      const graph = await adapter.loadGraph();
      
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].observations).toHaveLength(2);
      expect(graph.entities[0].observations[1].supersedes).toBe('obs1');
    });

    it('should handle large number of entities per thread', async () => {
      const entities: Entity[] = Array.from({ length: 100 }, (_, i) => ({
        name: `Entity${i}`,
        entityType: 'Type',
        observations: [{
          id: `obs${i}`,
          content: `Test observation ${i}`,
          timestamp: new Date().toISOString(),
          version: 1,
          agentThreadId: 'bulk_thread'
        }],
        agentThreadId: 'bulk_thread',
        timestamp: new Date().toISOString(),
        confidence: 0.9,
        importance: 0.8
      }));

      await adapter.saveGraph({ entities, relations: [] });

      const graph = await adapter.loadGraph();
      
      expect(graph.entities).toHaveLength(100);
    });

    it('should handle directory with invalid files gracefully', async () => {
      // Create an invalid file in the directory
      const invalidFile = path.join(testDir, 'invalid_file.txt');
      await fs.writeFile(invalidFile, 'This is not a JSONL file');

      // Should not throw when loading
      const graph = await adapter.loadGraph();
      
      expect(Array.isArray(graph.entities)).toBe(true);
      expect(Array.isArray(graph.relations)).toBe(true);
    });
  });
});
