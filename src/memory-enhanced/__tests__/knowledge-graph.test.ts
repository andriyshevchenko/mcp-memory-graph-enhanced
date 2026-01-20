import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager, Entity, Relation, KnowledgeGraph } from '../index.js';

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
          confidence: 0.95
        },
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: ['likes programming'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9
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
          confidence: 0.95
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
          confidence: 0.95
        },
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95
        },
      ]);

      const relations: Relation[] = [
        { 
          from: 'Alice', 
          to: 'Bob', 
          relationType: 'knows',
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9
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
          confidence: 0.95
        },
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95
        },
      ]);

      const relations: Relation[] = [
        { 
          from: 'Alice', 
          to: 'Bob', 
          relationType: 'knows',
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9
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
          confidence: 0.95
        },
      ];

      const entitiesThread2: Entity[] = [
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: ['likes programming'],
          agentThreadId: 'thread-002',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9
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
          confidence: 0.95
        },
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95
        },
        { 
          name: 'Charlie', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-002',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95
        },
      ]);

      const relationsThread1: Relation[] = [
        { 
          from: 'Alice', 
          to: 'Bob', 
          relationType: 'knows',
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9
        },
      ];

      const relationsThread2: Relation[] = [
        { 
          from: 'Alice', 
          to: 'Charlie', 
          relationType: 'knows',
          agentThreadId: 'thread-002',
          timestamp: '2024-01-20T10:02:00Z',
          confidence: 0.85
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
          confidence: 0.95
        },
      ]);

      const observations = [
        {
          entityName: 'Alice',
          contents: ['lives in San Francisco', 'loves coffee'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:05:00Z',
          confidence: 0.92
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
          confidence: 0.95
        },
      ]);

      const observations = [
        {
          entityName: 'Alice',
          contents: ['works at Acme Corp'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:05:00Z',
          confidence: 0.92
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
          confidence: 0.92
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
          confidence: 0.95
        },
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.95
        },
      ]);

      await manager.createRelations([
        { 
          from: 'Alice', 
          to: 'Bob', 
          relationType: 'knows',
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9
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
          confidence: 0.95
        },
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: ['likes programming'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9
        },
        { 
          name: 'Acme Corp', 
          entityType: 'company', 
          observations: ['tech company'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:02:00Z',
          confidence: 0.98
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
          confidence: 0.95
        },
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: ['likes programming'],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:01:00Z',
          confidence: 0.9
        },
      ]);

      const result = await manager.openNodes(['Alice']);
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('Alice');
    });
  });
});
