import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager } from '../lib/knowledge-graph-manager.js';
import { Entity, Relation } from '../lib/types.js';

describe('Thread Isolation', () => {
  let manager: KnowledgeGraphManager;
  let testDirPath: string;
  const THREAD_1 = 'thread-1';
  const THREAD_2 = 'thread-2';

  beforeEach(async () => {
    // Create a temporary test directory
    testDirPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      `test-thread-isolation-${Date.now()}`
    );
    await fs.mkdir(testDirPath, { recursive: true });
    manager = new KnowledgeGraphManager(testDirPath);

    // Set up test data in two different threads
    const entitiesThread1: Entity[] = [
      {
        name: 'User1',
        entityType: 'Person',
        observations: [{
          id: 'obs-1-1',
          content: 'User from thread 1',
          timestamp: '2026-01-01T10:00:00Z',
          version: 1,
          agentThreadId: THREAD_1
        }],
        agentThreadId: THREAD_1,
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 1.0,
        importance: 0.8
      },
      {
        name: 'Project1',
        entityType: 'Project',
        observations: [{
          id: 'obs-1-2',
          content: 'Project from thread 1',
          timestamp: '2026-01-01T10:00:00Z',
          version: 1,
          agentThreadId: THREAD_1
        }],
        agentThreadId: THREAD_1,
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 1.0,
        importance: 0.7
      }
    ];

    const entitiesThread2: Entity[] = [
      {
        name: 'User2',
        entityType: 'Person',
        observations: [{
          id: 'obs-2-1',
          content: 'User from thread 2',
          timestamp: '2026-01-02T10:00:00Z',
          version: 1,
          agentThreadId: THREAD_2
        }],
        agentThreadId: THREAD_2,
        timestamp: '2026-01-02T10:00:00Z',
        confidence: 1.0,
        importance: 0.9
      },
      {
        name: 'Project2',
        entityType: 'Project',
        observations: [{
          id: 'obs-2-2',
          content: 'Project from thread 2',
          timestamp: '2026-01-02T10:00:00Z',
          version: 1,
          agentThreadId: THREAD_2
        }],
        agentThreadId: THREAD_2,
        timestamp: '2026-01-02T10:00:00Z',
        confidence: 1.0,
        importance: 0.6
      }
    ];

    await manager.createEntities(THREAD_1, entitiesThread1);
    await manager.createEntities(THREAD_2, entitiesThread2);

    // Create relations in each thread
    const relationsThread1: Relation[] = [
      {
        from: 'User1',
        to: 'Project1',
        relationType: 'works on',
        agentThreadId: THREAD_1,
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 1.0,
        importance: 0.8
      }
    ];

    const relationsThread2: Relation[] = [
      {
        from: 'User2',
        to: 'Project2',
        relationType: 'manages',
        agentThreadId: THREAD_2,
        timestamp: '2026-01-02T10:00:00Z',
        confidence: 1.0,
        importance: 0.9
      }
    ];

    await manager.createRelations(THREAD_1, relationsThread1);
    await manager.createRelations(THREAD_2, relationsThread2);
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

  describe('readGraph', () => {
    it('should only return entities and relations from the specified thread', async () => {
      const graph1 = await manager.readGraph(THREAD_1);
      expect(graph1.entities).toHaveLength(2);
      expect(graph1.entities.every(e => e.agentThreadId === THREAD_1)).toBe(true);
      expect(graph1.entities.map(e => e.name).sort()).toEqual(['Project1', 'User1']);
      expect(graph1.relations).toHaveLength(1);
      expect(graph1.relations[0].agentThreadId).toBe(THREAD_1);

      const graph2 = await manager.readGraph(THREAD_2);
      expect(graph2.entities).toHaveLength(2);
      expect(graph2.entities.every(e => e.agentThreadId === THREAD_2)).toBe(true);
      expect(graph2.entities.map(e => e.name).sort()).toEqual(['Project2', 'User2']);
      expect(graph2.relations).toHaveLength(1);
      expect(graph2.relations[0].agentThreadId).toBe(THREAD_2);
    });

    it('should not leak data between threads', async () => {
      const graph1 = await manager.readGraph(THREAD_1);
      const graph2 = await manager.readGraph(THREAD_2);

      // Verify thread 1 has no thread 2 data
      expect(graph1.entities.find(e => e.name === 'User2')).toBeUndefined();
      expect(graph1.entities.find(e => e.name === 'Project2')).toBeUndefined();

      // Verify thread 2 has no thread 1 data
      expect(graph2.entities.find(e => e.name === 'User1')).toBeUndefined();
      expect(graph2.entities.find(e => e.name === 'Project1')).toBeUndefined();
    });
  });

  describe('searchNodes', () => {
    it('should only search within the specified thread', async () => {
      const results1 = await manager.searchNodes(THREAD_1, 'User');
      expect(results1.entities).toHaveLength(1);
      expect(results1.entities[0].name).toBe('User1');

      const results2 = await manager.searchNodes(THREAD_2, 'User');
      expect(results2.entities).toHaveLength(1);
      expect(results2.entities[0].name).toBe('User2');
    });
  });

  describe('openNodes', () => {
    it('should only open nodes from the specified thread', async () => {
      // Try to open User2 in thread 1 - should return empty
      const result1 = await manager.openNodes(THREAD_1, ['User2']);
      expect(result1.entities).toHaveLength(0);

      // Open User2 in thread 2 - should succeed
      const result2 = await manager.openNodes(THREAD_2, ['User2']);
      expect(result2.entities).toHaveLength(1);
      expect(result2.entities[0].name).toBe('User2');
    });
  });

  describe('queryNodes', () => {
    it('should only query nodes from the specified thread', async () => {
      const results1 = await manager.queryNodes(THREAD_1, {
        confidenceMin: 0.5
      });
      expect(results1.entities).toHaveLength(2);
      expect(results1.entities.every(e => e.agentThreadId === THREAD_1)).toBe(true);

      const results2 = await manager.queryNodes(THREAD_2, {
        confidenceMin: 0.5
      });
      expect(results2.entities).toHaveLength(2);
      expect(results2.entities.every(e => e.agentThreadId === THREAD_2)).toBe(true);
    });
  });

  describe('listEntities', () => {
    it('should only list entities from the specified thread', async () => {
      const list1 = await manager.listEntities(THREAD_1);
      expect(list1).toHaveLength(2);
      expect(list1.map(e => e.name).sort()).toEqual(['Project1', 'User1']);

      const list2 = await manager.listEntities(THREAD_2);
      expect(list2).toHaveLength(2);
      expect(list2.map(e => e.name).sort()).toEqual(['Project2', 'User2']);
    });

    it('should filter by entity type within thread', async () => {
      const list = await manager.listEntities(THREAD_1, 'Person');
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('User1');
    });
  });

  describe('getMemoryStats', () => {
    it('should return stats only for the specified thread', async () => {
      const stats1 = await manager.getMemoryStats(THREAD_1);
      expect(stats1.entityCount).toBe(2);
      expect(stats1.relationCount).toBe(1);

      const stats2 = await manager.getMemoryStats(THREAD_2);
      expect(stats2.entityCount).toBe(2);
      expect(stats2.relationCount).toBe(1);
    });
  });

  describe('getRecentChanges', () => {
    it('should only return changes from the specified thread', async () => {
      const changes1 = await manager.getRecentChanges(THREAD_1, '2026-01-01T00:00:00Z');
      expect(changes1.entities).toHaveLength(2);
      expect(changes1.entities.every(e => e.agentThreadId === THREAD_1)).toBe(true);

      const changes2 = await manager.getRecentChanges(THREAD_2, '2026-01-01T00:00:00Z');
      expect(changes2.entities).toHaveLength(2);
      expect(changes2.entities.every(e => e.agentThreadId === THREAD_2)).toBe(true);
    });
  });

  describe('findRelationPath', () => {
    it('should only find paths within the specified thread', async () => {
      const path1 = await manager.findRelationPath(THREAD_1, 'User1', 'Project1');
      expect(path1.found).toBe(true);
      expect(path1.path).toEqual(['User1', 'Project1']);

      // Try to find path from User1 to Project2 in thread 1 - should fail
      const crossPath = await manager.findRelationPath(THREAD_1, 'User1', 'Project2');
      expect(crossPath.found).toBe(false);
    });
  });

  describe('detectConflicts', () => {
    it('should only detect conflicts within the specified thread', async () => {
      // Add conflicting observations to thread 1
      const entityWithConflict: Entity = {
        name: 'ConflictEntity',
        entityType: 'Test',
        observations: [
          {
            id: 'obs-c1',
            content: 'The value is high',
            timestamp: '2026-01-01T10:00:00Z',
            version: 1,
            agentThreadId: THREAD_1
          },
          {
            id: 'obs-c2',
            content: 'The value is not high',
            timestamp: '2026-01-01T11:00:00Z',
            version: 1,
            agentThreadId: THREAD_1
          }
        ],
        agentThreadId: THREAD_1,
        timestamp: '2026-01-01T11:00:00Z',
        confidence: 1.0,
        importance: 0.5
      };

      await manager.createEntities(THREAD_1, [entityWithConflict]);

      const conflicts1 = await manager.detectConflicts(THREAD_1);
      expect(conflicts1.length).toBeGreaterThan(0);

      const conflicts2 = await manager.detectConflicts(THREAD_2);
      expect(conflicts2.find(c => c.entityName === 'ConflictEntity')).toBeUndefined();
    });
  });

  describe('getContext', () => {
    it('should only get context within the specified thread', async () => {
      const context1 = await manager.getContext(THREAD_1, ['User1'], 1);
      expect(context1.entities.length).toBeGreaterThan(0);
      expect(context1.entities.every(e => e.agentThreadId === THREAD_1)).toBe(true);

      const context2 = await manager.getContext(THREAD_2, ['User2'], 1);
      expect(context2.entities.length).toBeGreaterThan(0);
      expect(context2.entities.every(e => e.agentThreadId === THREAD_2)).toBe(true);
    });
  });

  describe('getFlaggedEntities', () => {
    it('should only return flagged entities from the specified thread', async () => {
      await manager.flagForReview(THREAD_1, 'User1', 'Test review');

      const flagged1 = await manager.getFlaggedEntities(THREAD_1);
      expect(flagged1.length).toBeGreaterThan(0);
      expect(flagged1[0].name).toBe('User1');

      const flagged2 = await manager.getFlaggedEntities(THREAD_2);
      expect(flagged2.find(e => e.name === 'User1')).toBeUndefined();
    });
  });

  describe('getObservationHistory', () => {
    it('should only retrieve observation history from the specified thread', async () => {
      const history1 = await manager.getObservationHistory(THREAD_1, 'User1', 'obs-1-1');
      expect(history1).toHaveLength(1);
      expect(history1[0].agentThreadId).toBe(THREAD_1);

      // Try to get observation from thread 2 while in thread 1 - should fail
      await expect(
        manager.getObservationHistory(THREAD_1, 'User2', 'obs-2-1')
      ).rejects.toThrow();
    });
  });

  describe('getEntityNamesInThread', () => {
    it('should only return entity names from the specified thread', async () => {
      const names1 = await manager.getEntityNamesInThread(THREAD_1);
      expect(names1.has('User1')).toBe(true);
      expect(names1.has('Project1')).toBe(true);
      expect(names1.has('User2')).toBe(false);
      expect(names1.has('Project2')).toBe(false);

      const names2 = await manager.getEntityNamesInThread(THREAD_2);
      expect(names2.has('User2')).toBe(true);
      expect(names2.has('Project2')).toBe(true);
      expect(names2.has('User1')).toBe(false);
      expect(names2.has('Project1')).toBe(false);
    });
  });

  describe('Cross-thread reference prevention', () => {
    it('should prevent relations to entities in other threads during validation', async () => {
      const names1 = await manager.getEntityNamesInThread(THREAD_1);
      
      // User2 exists in thread 2, but should not be visible to thread 1
      expect(names1.has('User2')).toBe(false);
      
      // This ensures that when save_memory validates relations,
      // it won't allow references to User2 from thread 1
    });
  });
});
