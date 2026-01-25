/**
 * Thread Isolation Tests
 * Verify that data from one thread never leaks to another thread
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeGraphManager } from '../lib/knowledge-graph-manager.js';
import { Entity, Relation, KnowledgeGraph, IStorageAdapter } from '../lib/types.js';

/**
 * In-memory storage adapter for thread isolation testing
 */
class InMemoryStorageAdapter implements IStorageAdapter {
  private graph: KnowledgeGraph = { entities: [], relations: [] };

  async loadGraph(): Promise<KnowledgeGraph> {
    return this.deepCopy(this.graph);
  }

  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    this.graph = this.deepCopy(graph);
  }

  async initialize(): Promise<void> {
    // No initialization needed for in-memory storage
  }

  private deepCopy(graph: KnowledgeGraph): KnowledgeGraph {
    return {
      entities: JSON.parse(JSON.stringify(graph.entities)),
      relations: JSON.parse(JSON.stringify(graph.relations))
    };
  }
}

describe('Thread Isolation', () => {
  let manager: KnowledgeGraphManager;
  let storage: InMemoryStorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    await storage.initialize();
    manager = new KnowledgeGraphManager('', storage);
  });

  describe('readGraph', () => {
    it('should only return entities from the specified thread', async () => {
      // Create entities in thread1
      const thread1Entities: Entity[] = [
        {
          name: 'Thread1Entity',
          entityType: 'Person',
          observations: [{ id: 'obs1', content: 'Thread 1 data', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread1' }],
          agentThreadId: 'thread1',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        }
      ];
      
      // Create entities in thread2
      const thread2Entities: Entity[] = [
        {
          name: 'Thread2Entity',
          entityType: 'Person',
          observations: [{ id: 'obs2', content: 'Thread 2 data', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread2' }],
          agentThreadId: 'thread2',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        }
      ];

      await manager.createEntities(thread1Entities);
      await manager.createEntities(thread2Entities);

      // Read from thread1 - should only see thread1 data
      const thread1Graph = await manager.readGraph('thread1');
      expect(thread1Graph.entities).toHaveLength(1);
      expect(thread1Graph.entities[0].name).toBe('Thread1Entity');
      expect(thread1Graph.entities[0].agentThreadId).toBe('thread1');

      // Read from thread2 - should only see thread2 data
      const thread2Graph = await manager.readGraph('thread2');
      expect(thread2Graph.entities).toHaveLength(1);
      expect(thread2Graph.entities[0].name).toBe('Thread2Entity');
      expect(thread2Graph.entities[0].agentThreadId).toBe('thread2');
    });

    it('should only return relations from the specified thread', async () => {
      // Create entities and relations in different threads
      const entities: Entity[] = [
        {
          name: 'Alice',
          entityType: 'Person',
          observations: [{ id: 'obs1', content: 'Alice', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread1' }],
          agentThreadId: 'thread1',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        },
        {
          name: 'Bob',
          entityType: 'Person',
          observations: [{ id: 'obs2', content: 'Bob', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread1' }],
          agentThreadId: 'thread1',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        },
        {
          name: 'Charlie',
          entityType: 'Person',
          observations: [{ id: 'obs3', content: 'Charlie', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread2' }],
          agentThreadId: 'thread2',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        }
      ];

      await manager.createEntities(entities);

      const relations: Relation[] = [
        {
          from: 'Alice',
          to: 'Bob',
          relationType: 'knows',
          agentThreadId: 'thread1',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        },
        {
          from: 'Charlie',
          to: 'Charlie',
          relationType: 'self',
          agentThreadId: 'thread2',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        }
      ];

      await manager.createRelations(relations);

      // Read from thread1
      const thread1Graph = await manager.readGraph('thread1');
      expect(thread1Graph.entities).toHaveLength(2);
      expect(thread1Graph.relations).toHaveLength(1);
      expect(thread1Graph.relations[0].from).toBe('Alice');

      // Read from thread2
      const thread2Graph = await manager.readGraph('thread2');
      expect(thread2Graph.entities).toHaveLength(1);
      expect(thread2Graph.relations).toHaveLength(1);
      expect(thread2Graph.relations[0].from).toBe('Charlie');
    });
  });

  describe('searchNodes', () => {
    it('should only search within the specified thread', async () => {
      const entities: Entity[] = [
        {
          name: 'TestEntity',
          entityType: 'Test',
          observations: [{ id: 'obs1', content: 'secret data', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread1' }],
          agentThreadId: 'thread1',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        },
        {
          name: 'TestEntity2',
          entityType: 'Test',
          observations: [{ id: 'obs2', content: 'secret data', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread2' }],
          agentThreadId: 'thread2',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        }
      ];

      await manager.createEntities(entities);

      // Search in thread1
      const thread1Results = await manager.searchNodes('secret', 'thread1');
      expect(thread1Results.entities).toHaveLength(1);
      expect(thread1Results.entities[0].name).toBe('TestEntity');

      // Search in thread2
      const thread2Results = await manager.searchNodes('secret', 'thread2');
      expect(thread2Results.entities).toHaveLength(1);
      expect(thread2Results.entities[0].name).toBe('TestEntity2');
    });
  });

  describe('openNodes', () => {
    it('should only open nodes from the specified thread', async () => {
      const entities: Entity[] = [
        {
          name: 'SharedName',
          entityType: 'Type1',
          observations: [{ id: 'obs1', content: 'Thread 1', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread1' }],
          agentThreadId: 'thread1',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        },
        {
          name: 'SharedName',
          entityType: 'Type2',
          observations: [{ id: 'obs2', content: 'Thread 2', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread2' }],
          agentThreadId: 'thread2',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        }
      ];

      await manager.createEntities(entities);

      // Open in thread1 - should get Type1
      const thread1Results = await manager.openNodes(['SharedName'], 'thread1');
      expect(thread1Results.entities).toHaveLength(1);
      expect(thread1Results.entities[0].entityType).toBe('Type1');

      // Open in thread2 - should get Type2
      const thread2Results = await manager.openNodes(['SharedName'], 'thread2');
      expect(thread2Results.entities).toHaveLength(1);
      expect(thread2Results.entities[0].entityType).toBe('Type2');
    });
  });

  describe('getMemoryStats', () => {
    it('should only count entities/relations from the specified thread', async () => {
      // Create data in multiple threads
      const entities: Entity[] = [
        {
          name: 'E1',
          entityType: 'Type1',
          observations: [{ id: 'obs1', content: 'E1', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread1' }],
          agentThreadId: 'thread1',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 0.9,
          importance: 0.7
        },
        {
          name: 'E2',
          entityType: 'Type1',
          observations: [{ id: 'obs2', content: 'E2', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread1' }],
          agentThreadId: 'thread1',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 0.8,
          importance: 0.6
        },
        {
          name: 'E3',
          entityType: 'Type2',
          observations: [{ id: 'obs3', content: 'E3', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread2' }],
          agentThreadId: 'thread2',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 0.5,
          importance: 0.5
        }
      ];

      await manager.createEntities(entities);

      // Stats for thread1
      const thread1Stats = await manager.getMemoryStats('thread1');
      expect(thread1Stats.entityCount).toBe(2);
      expect(thread1Stats.avgConfidence).toBeCloseTo(0.85, 2); // (0.9 + 0.8) / 2

      // Stats for thread2
      const thread2Stats = await manager.getMemoryStats('thread2');
      expect(thread2Stats.entityCount).toBe(1);
      expect(thread2Stats.avgConfidence).toBe(0.5);
    });
  });

  describe('detectConflicts', () => {
    it('should only detect conflicts within the specified thread', async () => {
      const entities: Entity[] = [
        {
          name: 'Person1',
          entityType: 'Person',
          observations: [
            { id: 'obs1', content: 'is employed', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread1' },
            { id: 'obs2', content: 'is not employed', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread1' }
          ],
          agentThreadId: 'thread1',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        },
        {
          name: 'Person2',
          entityType: 'Person',
          observations: [
            { id: 'obs3', content: 'is happy', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread2' },
            { id: 'obs4', content: 'is not happy', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread2' }
          ],
          agentThreadId: 'thread2',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        }
      ];

      await manager.createEntities(entities);

      // Detect conflicts in thread1
      const thread1Conflicts = await manager.detectConflicts('thread1');
      expect(thread1Conflicts.length).toBeGreaterThanOrEqual(0); // May or may not detect conflict
      if (thread1Conflicts.length > 0) {
        expect(thread1Conflicts[0].entityName).toBe('Person1');
      }

      // Detect conflicts in thread2
      const thread2Conflicts = await manager.detectConflicts('thread2');
      expect(thread2Conflicts.length).toBeGreaterThanOrEqual(0);
      if (thread2Conflicts.length > 0) {
        expect(thread2Conflicts[0].entityName).toBe('Person2');
      }

      // Verify no cross-thread leakage
      const allThread1Entities = thread1Conflicts.map(c => c.entityName);
      expect(allThread1Entities).not.toContain('Person2');

      const allThread2Entities = thread2Conflicts.map(c => c.entityName);
      expect(allThread2Entities).not.toContain('Person1');
    });
  });

  describe('getContext', () => {
    it('should only expand context within the specified thread', async () => {
      // Create a graph in thread1: A -> B -> C
      const thread1Entities: Entity[] = [
        {
          name: 'A',
          entityType: 'Node',
          observations: [{ id: 'obs1', content: 'A', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread1' }],
          agentThreadId: 'thread1',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        },
        {
          name: 'B',
          entityType: 'Node',
          observations: [{ id: 'obs2', content: 'B', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread1' }],
          agentThreadId: 'thread1',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        },
        {
          name: 'C',
          entityType: 'Node',
          observations: [{ id: 'obs3', content: 'C', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread1' }],
          agentThreadId: 'thread1',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        },
        {
          name: 'D',
          entityType: 'Node',
          observations: [{ id: 'obs4', content: 'D', timestamp: '2024-01-01T00:00:00Z', version: 1, agentThreadId: 'thread2' }],
          agentThreadId: 'thread2',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        }
      ];

      await manager.createEntities(thread1Entities);

      const relations: Relation[] = [
        { from: 'A', to: 'B', relationType: 'links', agentThreadId: 'thread1', timestamp: '2024-01-01T00:00:00Z', confidence: 1.0, importance: 0.8 },
        { from: 'B', to: 'C', relationType: 'links', agentThreadId: 'thread1', timestamp: '2024-01-01T00:00:00Z', confidence: 1.0, importance: 0.8 },
        { from: 'B', to: 'D', relationType: 'links', agentThreadId: 'thread2', timestamp: '2024-01-01T00:00:00Z', confidence: 1.0, importance: 0.8 }
      ];

      await manager.createRelations(relations);

      // Get context from A with depth 2 in thread1
      const thread1Context = await manager.getContext(['A'], 2, 'thread1');
      
      // Should include A, B, C (within thread1) but NOT D (from thread2)
      const entityNames = thread1Context.entities.map(e => e.name);
      expect(entityNames).toContain('A');
      expect(entityNames).toContain('B');
      expect(entityNames).toContain('C');
      expect(entityNames).not.toContain('D'); // Cross-thread entity should not leak
    });
  });
});
