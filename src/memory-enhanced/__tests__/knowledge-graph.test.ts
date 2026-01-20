import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager, Entity, Relation } from '../index.js';

describe('KnowledgeGraphManager - Enhanced with Metadata', () => {
  let manager: KnowledgeGraphManager;
  let testDirPath: string;

  beforeEach(async () => {
    // Create a temporary test directory
    testDirPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      `test-memory-dir-${Date.now()}`
    );
    await fs.mkdir(testDirPath, { recursive: true });
    manager = new KnowledgeGraphManager(testDirPath);
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

  describe('createEntities with metadata', () => {
    it('should create new entities with all metadata fields', async () => {
      const entities: Entity[] = [
        { 
          name: 'Alice', 
          entityType: 'person', 
          observations: ['works at Acme Corp'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: ['likes programming'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9,
          importance: 0.7
        },
      ];

      const newEntities = await manager.createEntities(entities);
      expect(newEntities).toHaveLength(2);
      expect(newEntities).toEqual(entities);

      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(2);
      expect(graph.entities[0].agentThreadId).toBe('thread-001');
      expect(graph.entities[0].timestamp).toBe('2024-01-20T10:00:00Z');
      expect(graph.entities[0].confidence).toBe(0.95);
    });

    it('should not create duplicate entities', async () => {
      const entities: Entity[] = [
        { 
          name: 'Alice', 
          entityType: 'person', 
          observations: ['works at Acme Corp'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
      ];

      await manager.createEntities(entities);
      const newEntities = await manager.createEntities(entities);

      expect(newEntities).toHaveLength(0);

      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(1);
    });

    it('should handle empty entity arrays', async () => {
      const newEntities = await manager.createEntities([]);
      expect(newEntities).toHaveLength(0);
    });
  });

  describe('createRelations with metadata', () => {
    it('should create new relations with all metadata fields', async () => {
      await manager.createEntities([
        { 
          name: 'Alice', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
      ]);

      const relations: Relation[] = [
        { 
          from: 'Alice', 
          to: 'Bob', 
          relationType: 'knows',
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9,
          importance: 0.7
        },
      ];

      const newRelations = await manager.createRelations(relations);
      expect(newRelations).toHaveLength(1);
      expect(newRelations).toEqual(relations);

      const graph = await manager.readGraph();
      expect(graph.relations).toHaveLength(1);
      expect(graph.relations[0].agentThreadId).toBe('thread-001');
      expect(graph.relations[0].timestamp).toBe('2024-01-20T10:01:00Z');
      expect(graph.relations[0].confidence).toBe(0.9);
    });

    it('should not create duplicate relations', async () => {
      await manager.createEntities([
        { 
          name: 'Alice', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
      ]);

      const relations: Relation[] = [
        { 
          from: 'Alice', 
          to: 'Bob', 
          relationType: 'knows',
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9,
          importance: 0.7
        },
      ];

      await manager.createRelations(relations);
      const newRelations = await manager.createRelations(relations);

      expect(newRelations).toHaveLength(0);

      const graph = await manager.readGraph();
      expect(graph.relations).toHaveLength(1);
    });
  });

  describe('Multi-thread file storage', () => {
    it('should store entities from different threads in separate files', async () => {
      const entitiesThread1: Entity[] = [
        { 
          name: 'Alice', 
          entityType: 'person', 
          observations: ['works at Acme Corp'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
      ];

      const entitiesThread2: Entity[] = [
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: ['likes programming'],
          agentThreadId: 'thread-002',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9,
          importance: 0.7
        },
      ];

      await manager.createEntities(entitiesThread1);
      await manager.createEntities(entitiesThread2);

      // Check that two separate files were created
      const files = await fs.readdir(testDirPath);
      const threadFiles = files.filter(f => f.startsWith('thread-') && f.endsWith('.jsonl'));
      expect(threadFiles).toHaveLength(2);
      expect(threadFiles).toContain('thread-thread-001.jsonl');
      expect(threadFiles).toContain('thread-thread-002.jsonl');

      // Verify we can read all entities
      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(2);
    });

    it('should store relations from different threads in separate files', async () => {
      await manager.createEntities([
        { 
          name: 'Alice', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
        { 
          name: 'Charlie', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-002',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
      ]);

      const relationsThread1: Relation[] = [
        { 
          from: 'Alice', 
          to: 'Bob', 
          relationType: 'knows',
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9,
          importance: 0.7
        },
      ];

      const relationsThread2: Relation[] = [
        { 
          from: 'Alice', 
          to: 'Charlie', 
          relationType: 'knows',
          agentThreadId: 'thread-002',
          timestamp: '2024-01-20T10:02:00Z',
          confidence: 0.85,
          importance: 0.65
        },
      ];

      await manager.createRelations(relationsThread1);
      await manager.createRelations(relationsThread2);

      // Verify all relations are readable
      const graph = await manager.readGraph();
      expect(graph.relations).toHaveLength(2);
    });
  });

  describe('addObservations with metadata', () => {
    it('should add observations and update entity metadata', async () => {
      await manager.createEntities([
        { 
          name: 'Alice', 
          entityType: 'person', 
          observations: ['works at Acme Corp'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
      ]);

      const observations = [
        {
          entityName: 'Alice',
          contents: ['lives in San Francisco', 'loves coffee'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:05:00Z',
          confidence: 0.92,
          importance: 0.75
        }
      ];

      const result = await manager.addObservations(observations);
      expect(result).toHaveLength(1);
      expect(result[0].addedObservations).toHaveLength(2);

      const graph = await manager.readGraph();
      const alice = graph.entities.find(e => e.name === 'Alice');
      expect(alice?.observations).toHaveLength(3);
      expect(alice?.timestamp).toBe('2024-01-20T10:05:00Z');
      expect(alice?.confidence).toBe(0.92);
    });

    it('should not add duplicate observations', async () => {
      await manager.createEntities([
        { 
          name: 'Alice', 
          entityType: 'person', 
          observations: ['works at Acme Corp'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
      ]);

      const observations = [
        {
          entityName: 'Alice',
          contents: ['works at Acme Corp'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:05:00Z',
          confidence: 0.92,
          importance: 0.75
        }
      ];

      const result = await manager.addObservations(observations);
      expect(result[0].addedObservations).toHaveLength(0);
    });

    it('should throw error for non-existent entity', async () => {
      const observations = [
        {
          entityName: 'NonExistent',
          contents: ['some observation'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:05:00Z',
          confidence: 0.92,
          importance: 0.75
        }
      ];

      await expect(manager.addObservations(observations)).rejects.toThrow('Entity with name NonExistent not found');
    });
  });

  describe('deleteEntities', () => {
    it('should delete entities and associated relations', async () => {
      await manager.createEntities([
        { 
          name: 'Alice', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
      ]);

      await manager.createRelations([
        { 
          from: 'Alice', 
          to: 'Bob', 
          relationType: 'knows',
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9,
          importance: 0.7
        },
      ]);

      await manager.deleteEntities(['Alice']);

      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('Bob');
      expect(graph.relations).toHaveLength(0);
    });
  });

  describe('searchNodes', () => {
    it('should search entities by name, type, and observations', async () => {
      await manager.createEntities([
        { 
          name: 'Alice', 
          entityType: 'person', 
          observations: ['works at Acme Corp'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: ['likes programming'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9,
          importance: 0.7
        },
        { 
          name: 'Acme Corp', 
          entityType: 'company', 
          observations: ['tech company'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:02:00Z',
          confidence: 0.98,
          importance: 0.9
        },
      ]);

      const result = await manager.searchNodes('programming');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('Bob');
    });
  });

  describe('openNodes', () => {
    it('should retrieve specific entities by name', async () => {
      await manager.createEntities([
        { 
          name: 'Alice', 
          entityType: 'person', 
          observations: ['works at Acme Corp'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: ['likes programming'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9,
          importance: 0.7
        },
      ]);

      const result = await manager.openNodes(['Alice']);
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('Alice');
    });
  });

  describe('queryNodes with range filtering', () => {
    beforeEach(async () => {
      // Create test data with varied metadata
      await manager.createEntities([
        {
          name: 'Alice',
          entityType: 'person',
          observations: ['works at Acme Corp'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.9
        },
        {
          name: 'Bob',
          entityType: 'person',
          observations: ['likes programming'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T12:00:00Z',
          confidence: 0.7,
          importance: 0.5
        },
        {
          name: 'Charlie',
          entityType: 'person',
          observations: ['data scientist'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T14:00:00Z',
          confidence: 0.85,
          importance: 0.3
        },
      ]);

      await manager.createRelations([
        {
          from: 'Alice',
          to: 'Bob',
          relationType: 'knows',
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T11:00:00Z',
          confidence: 0.9,
          importance: 0.8
        },
        {
          from: 'Bob',
          to: 'Charlie',
          relationType: 'works_with',
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T13:00:00Z',
          confidence: 0.6,
          importance: 0.4
        },
      ]);
    });

    it('should filter by timestamp range', async () => {
      const result = await manager.queryNodes({
        timestampStart: '2024-01-20T11:30:00Z',
        timestampEnd: '2024-01-20T13:30:00Z'
      });
      
      // Should get Bob (created at 12:00)
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('Bob');
      
      // No relations because Bob's relations connect to Alice and Charlie who are filtered out
      expect(result.relations).toHaveLength(0);
    });

    it('should filter by confidence range', async () => {
      const result = await manager.queryNodes({
        confidenceMin: 0.8,
        confidenceMax: 1.0
      });
      
      // Should get Alice (0.95) and Charlie (0.85)
      expect(result.entities).toHaveLength(2);
      const names = result.entities.map(e => e.name).sort();
      expect(names).toEqual(['Alice', 'Charlie']);
      
      // No relations because the knows relation connects to Bob who is filtered out
      expect(result.relations).toHaveLength(0);
    });

    it('should filter by importance range', async () => {
      const result = await manager.queryNodes({
        importanceMin: 0.6,
        importanceMax: 1.0
      });
      
      // Should get Alice (0.9) and Bob (but Bob is 0.5, so only Alice)
      // Wait, Bob is 0.5 which is < 0.6, so only Alice
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('Alice');
      
      // No relations because knows connects to Bob who is filtered out
      expect(result.relations).toHaveLength(0);
    });

    it('should filter by multiple range criteria', async () => {
      const result = await manager.queryNodes({
        confidenceMin: 0.8,
        importanceMin: 0.8
      });
      
      // Should get only Alice (confidence 0.95, importance 0.9)
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('Alice');
      
      // No relations because knows connects to Bob who doesn't meet the criteria
      expect(result.relations).toHaveLength(0);
    });

    it('should include relations when both entities pass filter', async () => {
      const result = await manager.queryNodes({
        importanceMin: 0.4,
        importanceMax: 0.9
      });
      
      // Should get Alice (0.9), Bob (0.5) - but not Charlie (0.3)
      expect(result.entities).toHaveLength(2);
      const names = result.entities.map(e => e.name).sort();
      expect(names).toEqual(['Alice', 'Bob']);
      
      // Should get the knows relation (0.8) because both Alice and Bob are included
      expect(result.relations).toHaveLength(1);
      expect(result.relations[0].relationType).toBe('knows');
    });

    it('should return all data when no filters provided', async () => {
      const result = await manager.queryNodes();
      
      expect(result.entities).toHaveLength(3);
      expect(result.relations).toHaveLength(2);
    });

    it('should return empty result when no data matches filters', async () => {
      const result = await manager.queryNodes({
        importanceMin: 0.95
      });
      
      expect(result.entities).toHaveLength(0);
      expect(result.relations).toHaveLength(0);
    });
  });

  describe('Cross-thread operations', () => {
    it('should maintain single entity when observations added from different thread', async () => {
      // Thread-001 creates entity
      await manager.createEntities([
        {
          name: 'Alice',
          entityType: 'person',
          observations: ['works at Acme'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        }
      ]);

      // Thread-002 adds observations to Alice
      await manager.addObservations([
        {
          entityName: 'Alice',
          contents: ['lives in SF', 'loves coffee'],
          agentThreadId: 'thread-002',
          timestamp: '2024-01-20T10:05:00Z',
          confidence: 0.92,
          importance: 0.75
        }
      ]);

      // Verify only one Alice entity exists
      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('Alice');
      expect(graph.entities[0].observations).toHaveLength(3);
      
      // Original agentThreadId should be preserved (thread-001)
      expect(graph.entities[0].agentThreadId).toBe('thread-001');
      
      // Verify only one thread file was created (thread-001)
      const files = await fs.readdir(testDirPath);
      const threadFiles = files.filter(f => f.startsWith('thread-') && f.endsWith('.jsonl'));
      expect(threadFiles).toHaveLength(1);
      expect(threadFiles[0]).toBe('thread-thread-001.jsonl');
    });
  });

  describe('listConversations', () => {
    it('should return empty array when no conversations exist', async () => {
      const result = await manager.listConversations();
      expect(result.conversations).toHaveLength(0);
    });

    it('should list single conversation with correct metadata', async () => {
      await manager.createEntities([
        {
          name: 'Alice',
          entityType: 'person',
          observations: ['works at Acme'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
        {
          name: 'Bob',
          entityType: 'person',
          observations: ['likes programming'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T12:00:00Z',
          confidence: 0.9,
          importance: 0.7
        }
      ]);

      await manager.createRelations([
        {
          from: 'Alice',
          to: 'Bob',
          relationType: 'knows',
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T11:00:00Z',
          confidence: 0.9,
          importance: 0.8
        }
      ]);

      const result = await manager.listConversations();
      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0]).toEqual({
        agentThreadId: 'thread-001',
        entityCount: 2,
        relationCount: 1,
        firstCreated: '2024-01-20T10:00:00Z',
        lastUpdated: '2024-01-20T12:00:00Z'
      });
    });

    it('should list multiple conversations sorted by last updated', async () => {
      // Create entities in thread-001
      await manager.createEntities([
        {
          name: 'Alice',
          entityType: 'person',
          observations: ['works at Acme'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        }
      ]);

      // Create entities in thread-002 (more recent)
      await manager.createEntities([
        {
          name: 'Bob',
          entityType: 'person',
          observations: ['likes programming'],
          agentThreadId: 'thread-002',
          timestamp: '2024-01-20T15:00:00Z',
          confidence: 0.9,
          importance: 0.7
        },
        {
          name: 'Charlie',
          entityType: 'person',
          observations: ['data scientist'],
          agentThreadId: 'thread-002',
          timestamp: '2024-01-20T16:00:00Z',
          confidence: 0.85,
          importance: 0.6
        }
      ]);

      // Create entities in thread-003
      await manager.createEntities([
        {
          name: 'Dave',
          entityType: 'person',
          observations: ['designer'],
          agentThreadId: 'thread-003',
          timestamp: '2024-01-20T12:00:00Z',
          confidence: 0.88,
          importance: 0.65
        }
      ]);

      const result = await manager.listConversations();
      expect(result.conversations).toHaveLength(3);
      
      // Should be sorted by last updated (most recent first)
      expect(result.conversations[0].agentThreadId).toBe('thread-002');
      expect(result.conversations[0].entityCount).toBe(2);
      expect(result.conversations[0].lastUpdated).toBe('2024-01-20T16:00:00Z');
      
      expect(result.conversations[1].agentThreadId).toBe('thread-003');
      expect(result.conversations[1].entityCount).toBe(1);
      
      expect(result.conversations[2].agentThreadId).toBe('thread-001');
      expect(result.conversations[2].entityCount).toBe(1);
    });

    it('should count both entities and relations from the same thread', async () => {
      await manager.createEntities([
        {
          name: 'Alice',
          entityType: 'person',
          observations: ['works at Acme'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
        {
          name: 'Bob',
          entityType: 'person',
          observations: ['likes programming'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T11:00:00Z',
          confidence: 0.9,
          importance: 0.7
        },
        {
          name: 'Charlie',
          entityType: 'person',
          observations: ['data scientist'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T12:00:00Z',
          confidence: 0.85,
          importance: 0.6
        }
      ]);

      await manager.createRelations([
        {
          from: 'Alice',
          to: 'Bob',
          relationType: 'knows',
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T13:00:00Z',
          confidence: 0.9,
          importance: 0.8
        },
        {
          from: 'Bob',
          to: 'Charlie',
          relationType: 'works_with',
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T14:00:00Z',
          confidence: 0.85,
          importance: 0.75
        }
      ]);

      const result = await manager.listConversations();
      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0]).toEqual({
        agentThreadId: 'thread-001',
        entityCount: 3,
        relationCount: 2,
        firstCreated: '2024-01-20T10:00:00Z',
        lastUpdated: '2024-01-20T14:00:00Z'
      });
    });

    it('should handle threads with only relations (no entities from that thread)', async () => {
      // Create entities in thread-001
      await manager.createEntities([
        {
          name: 'Alice',
          entityType: 'person',
          observations: ['works at Acme'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95,
          importance: 0.8
        },
        {
          name: 'Bob',
          entityType: 'person',
          observations: ['likes programming'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T11:00:00Z',
          confidence: 0.9,
          importance: 0.7
        }
      ]);

      // Create relation in thread-002 (different thread)
      await manager.createRelations([
        {
          from: 'Alice',
          to: 'Bob',
          relationType: 'knows',
          agentThreadId: 'thread-002',
          timestamp: '2024-01-20T12:00:00Z',
          confidence: 0.9,
          importance: 0.8
        }
      ]);

      const result = await manager.listConversations();
      expect(result.conversations).toHaveLength(2);
      
      const thread001 = result.conversations.find(c => c.agentThreadId === 'thread-001');
      const thread002 = result.conversations.find(c => c.agentThreadId === 'thread-002');
      
      expect(thread001).toBeDefined();
      expect(thread001?.entityCount).toBe(2);
      expect(thread001?.relationCount).toBe(0);
      
      expect(thread002).toBeDefined();
      expect(thread002?.entityCount).toBe(0);
      expect(thread002?.relationCount).toBe(1);
    });
  });
});
