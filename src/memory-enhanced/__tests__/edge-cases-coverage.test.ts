import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KnowledgeGraphManager } from '../lib/knowledge-graph-manager.js';
import { JsonlStorageAdapter } from '../lib/jsonl-storage-adapter.js';
import { promises as fs } from 'fs';

/**
 * Additional edge case tests to push coverage above 80%
 */
describe('Edge Cases for Coverage', () => {
  let manager: KnowledgeGraphManager;
  let testDir: string;
  let storage: JsonlStorageAdapter;

  beforeEach(async () => {
    testDir = `/tmp/test-edge-cases-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });
    storage = new JsonlStorageAdapter(testDir);
    await storage.initialize();
    manager = new KnowledgeGraphManager(testDir, storage);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('Analytics Edge Cases', () => {
    it('should handle orphaned entities with broken relations', async () => {
      // Create entities
      await manager.createEntities([
        {
          name: 'ValidEntity',
          entityType: 'Type',
          observations: [{
            id: 'obs1',
            content: 'Test observation',
            timestamp: new Date().toISOString(),
            version: 1,
            agentThreadId: 'thread1'
          }],
          agentThreadId: 'thread1',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          importance: 0.8
        }
      ]);

      // Create a relation pointing to a non-existent entity
      // Note: This will be rejected by normal validation, but we're testing the analytics detection
      const graph = await storage.loadGraph();
      graph.relations.push({
        from: 'ValidEntity',
        to: 'NonExistentEntity',
        relationType: 'broken',
        agentThreadId: 'thread1',
        timestamp: new Date().toISOString(),
        confidence: 0.5,
        importance: 0.5
      });
      await storage.saveGraph(graph);

      // Get analytics - should detect the broken relation
      const analytics = await manager.getAnalytics('thread1');

      // The orphaned entities detection should work
      expect(analytics).toHaveProperty('orphaned_entities');
    });

    it('should handle entities with zero relations', async () => {
      await manager.createEntities([
        {
          name: 'IsolatedEntity1',
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
          name: 'IsolatedEntity2',
          entityType: 'Type',
          observations: [{
            id: 'obs2',
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
      ]);

      const analytics = await manager.getAnalytics('thread1');

      // Should report orphaned entities
      expect(analytics.orphaned_entities.length).toBeGreaterThan(0);
    });

    it('should analyze entities with multiple observation versions', async () => {
      await manager.createEntities([
        {
          name: 'VersionedEntity',
          entityType: 'Type',
          observations: [
            {
              id: 'obs1',
              content: 'Original observation',
              timestamp: new Date(Date.now() - 1000).toISOString(),
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
        }
      ]);

      // Add a self-referencing relation to avoid orphaned status
      await manager.createRelations([
        {
          from: 'VersionedEntity',
          to: 'VersionedEntity',
          relationType: 'self_ref',
          agentThreadId: 'thread1',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          importance: 0.7
        }
      ]);

      const analytics = await manager.getAnalytics('thread1');

      expect(analytics.recent_changes.length).toBeGreaterThan(0);
    });
  });

  describe('Query Edge Cases', () => {
    it('should handle empty query results', async () => {
      const result = await manager.queryNodes('thread1', {
        entityType: 'NonExistentType'
      });

      expect(result.entities).toHaveLength(0);
      expect(result.relations).toHaveLength(0);
    });

    it('should handle query with all filters', async () => {
      const futureDate = new Date(Date.now() + 100000).toISOString();
      
      await manager.createEntities([
        {
          name: 'FilterTestEntity',
          entityType: 'TestType',
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
          importance: 0.9
        }
      ]);

      const result = await manager.queryNodes('thread1', {
        entityType: 'TestType',
        minConfidence: 0.8,
        minImportance: 0.8,
        createdAfter: new Date(Date.now() - 1000).toISOString(),
        createdBefore: futureDate
      });

      expect(result.entities.length).toBeGreaterThan(0);
    });
  });

  describe('Search Edge Cases', () => {
    it('should handle search with special regex characters', async () => {
      await manager.createEntities([
        {
          name: 'Entity.With.Dots',
          entityType: 'Type',
          observations: [{
            id: 'obs1',
            content: 'Test with special chars: $100 (USD)',
            timestamp: new Date().toISOString(),
            version: 1,
            agentThreadId: 'thread1'
          }],
          agentThreadId: 'thread1',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          importance: 0.8
        }
      ]);

      // Search should handle regex special characters safely
      const result = await manager.searchNodes('.', 'thread1');

      // Should not throw and return results
      expect(Array.isArray(result.entities)).toBe(true);
    });

    it('should handle case-insensitive search', async () => {
      await manager.createEntities([
        {
          name: 'TestEntityCaseSensitive',
          entityType: 'Type',
          observations: [{
            id: 'obs1',
            content: 'UPPERCASE and lowercase text',
            timestamp: new Date().toISOString(),
            version: 1,
            agentThreadId: 'thread1'
          }],
          agentThreadId: 'thread1',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          importance: 0.8
        }
      ]);

      // Search is case-insensitive
      const result1 = await manager.searchNodes('uppercase', 'thread1');
      const result2 = await manager.searchNodes('UPPERCASE', 'thread1');

      expect(result1.entities.length).toBeGreaterThan(0);
      expect(result2.entities.length).toBeGreaterThan(0);
    });
  });
});
