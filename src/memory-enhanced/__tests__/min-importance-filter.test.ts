/**
 * Test suite for minImportance filtering feature in read_graph
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readGraph } from '../lib/queries/graph-reader.js';
import { IStorageAdapter } from '../lib/storage-interface.js';
import { KnowledgeGraph } from '../lib/types.js';

// Mock storage adapter
class MockStorageAdapter implements IStorageAdapter {
  private graph: KnowledgeGraph = { entities: [], relations: [] };

  async initialize(): Promise<void> {}
  
  async loadGraph(): Promise<KnowledgeGraph> {
    return this.graph;
  }
  
  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    this.graph = graph;
  }
  
  setGraph(graph: KnowledgeGraph): void {
    this.graph = graph;
  }
}

describe('minImportance filtering in readGraph', () => {
  let storage: MockStorageAdapter;
  const threadId = 'test-thread-1';

  beforeEach(() => {
    storage = new MockStorageAdapter();
  });

  it('should filter out entities with importance below minImportance threshold', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        {
          name: 'High Importance Entity',
          entityType: 'Test',
          observations: [],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        },
        {
          name: 'Medium Importance Entity',
          entityType: 'Test',
          observations: [],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.15
        },
        {
          name: 'Low Importance Entity',
          entityType: 'Test',
          observations: [],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.05
        }
      ],
      relations: []
    };

    storage.setGraph(testGraph);
    
    // With default minImportance of 0.1, low importance entity should be filtered out
    const result = await readGraph(storage, threadId, 0.1);
    
    expect(result.entities).toHaveLength(2);
    expect(result.entities.find(e => e.name === 'High Importance Entity')).toBeDefined();
    expect(result.entities.find(e => e.name === 'Medium Importance Entity')).toBeDefined();
    expect(result.entities.find(e => e.name === 'Low Importance Entity')).toBeUndefined();
  });

  it('should mark entities with importance < 0.1 but >= minImportance as ARCHIVED', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        {
          name: 'High Importance Entity',
          entityType: 'Test',
          observations: [],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        },
        {
          name: 'Archived Entity',
          entityType: 'Test',
          observations: [],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.05
        }
      ],
      relations: []
    };

    storage.setGraph(testGraph);
    
    // With minImportance of 0.05, both should be included
    const result = await readGraph(storage, threadId, 0.05);
    
    expect(result.entities).toHaveLength(2);
    
    const highEntity = result.entities.find(e => e.name === 'High Importance Entity');
    const archivedEntity = result.entities.find(e => e.name === 'Archived Entity');
    
    expect(highEntity?.status).toBeUndefined();
    expect(archivedEntity?.status).toBe('ARCHIVED');
  });

  it('should filter out relations with importance below minImportance threshold', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        {
          name: 'Entity A',
          entityType: 'Test',
          observations: [],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        },
        {
          name: 'Entity B',
          entityType: 'Test',
          observations: [],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        }
      ],
      relations: [
        {
          from: 'Entity A',
          to: 'Entity B',
          relationType: 'connects to',
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.7
        },
        {
          from: 'Entity A',
          to: 'Entity B',
          relationType: 'low importance relation',
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.05
        }
      ]
    };

    storage.setGraph(testGraph);
    
    const result = await readGraph(storage, threadId, 0.1);
    
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].relationType).toBe('connects to');
  });

  it('should mark relations with importance < 0.1 but >= minImportance as ARCHIVED', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        {
          name: 'Entity A',
          entityType: 'Test',
          observations: [],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        },
        {
          name: 'Entity B',
          entityType: 'Test',
          observations: [],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        }
      ],
      relations: [
        {
          from: 'Entity A',
          to: 'Entity B',
          relationType: 'high importance relation',
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.7
        },
        {
          from: 'Entity A',
          to: 'Entity B',
          relationType: 'archived relation',
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.06
        }
      ]
    };

    storage.setGraph(testGraph);
    
    const result = await readGraph(storage, threadId, 0.05);
    
    expect(result.relations).toHaveLength(2);
    
    const highRelation = result.relations.find(r => r.relationType === 'high importance relation');
    const archivedRelation = result.relations.find(r => r.relationType === 'archived relation');
    
    expect(highRelation?.status).toBeUndefined();
    expect(archivedRelation?.status).toBe('ARCHIVED');
  });

  it('should filter observations by importance (inheriting from entity if not set)', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        {
          name: 'Entity with Observations',
          entityType: 'Test',
          observations: [
            {
              id: 'obs-1',
              content: 'High importance observation',
              timestamp: '2024-01-01T00:00:00Z',
              version: 1,
              agentThreadId: threadId,
              importance: 0.8
            },
            {
              id: 'obs-2',
              content: 'Observation inheriting entity importance',
              timestamp: '2024-01-01T00:00:00Z',
              version: 1,
              agentThreadId: threadId
              // No importance set, should inherit from entity (0.15)
            },
            {
              id: 'obs-3',
              content: 'Low importance observation',
              timestamp: '2024-01-01T00:00:00Z',
              version: 1,
              agentThreadId: threadId,
              importance: 0.03
            }
          ],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.15
        }
      ],
      relations: []
    };

    storage.setGraph(testGraph);
    
    const result = await readGraph(storage, threadId, 0.1);
    
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].observations).toHaveLength(2);
    expect(result.entities[0].observations.find(o => o.id === 'obs-1')).toBeDefined();
    expect(result.entities[0].observations.find(o => o.id === 'obs-2')).toBeDefined();
    expect(result.entities[0].observations.find(o => o.id === 'obs-3')).toBeUndefined();
  });

  it('should mark observations with importance < 0.1 but >= minImportance as ARCHIVED', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        {
          name: 'Entity with Observations',
          entityType: 'Test',
          observations: [
            {
              id: 'obs-1',
              content: 'High importance observation',
              timestamp: '2024-01-01T00:00:00Z',
              version: 1,
              agentThreadId: threadId,
              importance: 0.8
            },
            {
              id: 'obs-2',
              content: 'Archived observation',
              timestamp: '2024-01-01T00:00:00Z',
              version: 1,
              agentThreadId: threadId,
              importance: 0.06
            }
          ],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        }
      ],
      relations: []
    };

    storage.setGraph(testGraph);
    
    const result = await readGraph(storage, threadId, 0.05);
    
    expect(result.entities[0].observations).toHaveLength(2);
    
    const highObs = result.entities[0].observations.find(o => o.id === 'obs-1');
    const archivedObs = result.entities[0].observations.find(o => o.id === 'obs-2');
    
    expect(highObs?.status).toBeUndefined();
    expect(archivedObs?.status).toBe('ARCHIVED');
  });

  it('should handle custom minImportance values', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        {
          name: 'Entity 1',
          entityType: 'Test',
          observations: [],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.5
        },
        {
          name: 'Entity 2',
          entityType: 'Test',
          observations: [],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.3
        },
        {
          name: 'Entity 3',
          entityType: 'Test',
          observations: [],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.2
        }
      ],
      relations: []
    };

    storage.setGraph(testGraph);
    
    // Test with minImportance = 0.4
    const result = await readGraph(storage, threadId, 0.4);
    
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].name).toBe('Entity 1');
  });

  it('should maintain thread isolation with importance filtering', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        {
          name: 'Thread 1 Entity',
          entityType: 'Test',
          observations: [],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.8
        },
        {
          name: 'Thread 2 Entity',
          entityType: 'Test',
          observations: [],
          agentThreadId: 'other-thread',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.9
        }
      ],
      relations: []
    };

    storage.setGraph(testGraph);
    
    const result = await readGraph(storage, threadId, 0.1);
    
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].name).toBe('Thread 1 Entity');
  });

  it('should use default minImportance of 0.1 when not specified', async () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        {
          name: 'Entity Above Default',
          entityType: 'Test',
          observations: [],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.15
        },
        {
          name: 'Entity Below Default',
          entityType: 'Test',
          observations: [],
          agentThreadId: threadId,
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.05
        }
      ],
      relations: []
    };

    storage.setGraph(testGraph);
    
    // Call without specifying minImportance (should default to 0.1)
    const result = await readGraph(storage, threadId);
    
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].name).toBe('Entity Above Default');
  });
});
