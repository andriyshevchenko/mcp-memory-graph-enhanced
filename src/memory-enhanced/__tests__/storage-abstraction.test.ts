import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager, Entity, Relation, KnowledgeGraph, IStorageAdapter, JsonlStorageAdapter } from '../index.js';

/**
 * Mock in-memory storage adapter for testing the abstraction
 * This demonstrates how a custom storage adapter (like Neo4j) could be implemented
 */
class InMemoryStorageAdapter implements IStorageAdapter {
  private graph: KnowledgeGraph = { entities: [], relations: [] };

  async loadGraph(): Promise<KnowledgeGraph> {
    // Return a deep copy to prevent external mutations
    return {
      entities: JSON.parse(JSON.stringify(this.graph.entities)),
      relations: JSON.parse(JSON.stringify(this.graph.relations))
    };
  }

  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    // Store a deep copy to prevent external mutations
    this.graph = {
      entities: JSON.parse(JSON.stringify(graph.entities)),
      relations: JSON.parse(JSON.stringify(graph.relations))
    };
  }

  async initialize(): Promise<void> {
    // No initialization needed for in-memory storage
  }
}

describe('Storage Abstraction', () => {
  describe('with JSONL storage adapter (default)', () => {
    let manager: KnowledgeGraphManager;
    let testDirPath: string;

    beforeEach(async () => {
      // Create a temporary test directory
      testDirPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        `test-jsonl-storage-${Date.now()}`
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

    it('should create and read entities using JSONL storage', async () => {
      const entities: Entity[] = [
        { 
          name: 'TestEntity', 
          entityType: 'test', 
          observations: [{ 
            id: 'obs-1',
            content: 'test observation',
            timestamp: '2024-01-20T10:00:00Z',
            version: 1,
            agentThreadId: 'thread-001',
            confidence: 0.9,
            importance: 0.8
          }],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.9,
          importance: 0.8
        }
      ];

      await manager.createEntities(entities);
      const graph = await manager.readGraph();
      
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('TestEntity');
    });
  });

  describe('with custom in-memory storage adapter', () => {
    let manager: KnowledgeGraphManager;

    beforeEach(() => {
      const inMemoryStorage = new InMemoryStorageAdapter();
      manager = new KnowledgeGraphManager('', inMemoryStorage);
    });

    it('should create and read entities using in-memory storage', async () => {
      const entities: Entity[] = [
        { 
          name: 'TestEntity', 
          entityType: 'test', 
          observations: [{ 
            id: 'obs-1',
            content: 'test observation',
            timestamp: '2024-01-20T10:00:00Z',
            version: 1,
            agentThreadId: 'thread-001',
            confidence: 0.9,
            importance: 0.8
          }],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.9,
          importance: 0.8
        }
      ];

      await manager.createEntities(entities);
      const graph = await manager.readGraph();
      
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('TestEntity');
    });

    it('should create entities and relations using in-memory storage', async () => {
      const entities: Entity[] = [
        { 
          name: 'Alice', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.9,
          importance: 0.8
        },
        { 
          name: 'Bob', 
          entityType: 'person', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.9,
          importance: 0.8
        }
      ];

      const relations: Relation[] = [
        {
          from: 'Alice',
          to: 'Bob',
          relationType: 'knows',
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.9,
          importance: 0.8
        }
      ];

      await manager.createEntities(entities);
      await manager.createRelations(relations);
      
      const graph = await manager.readGraph();
      
      expect(graph.entities).toHaveLength(2);
      expect(graph.relations).toHaveLength(1);
      expect(graph.relations[0].from).toBe('Alice');
      expect(graph.relations[0].to).toBe('Bob');
    });

    it('should handle multiple operations with in-memory storage', async () => {
      const entities1: Entity[] = [
        { 
          name: 'Entity1', 
          entityType: 'test', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.9,
          importance: 0.8
        }
      ];

      const entities2: Entity[] = [
        { 
          name: 'Entity2', 
          entityType: 'test', 
          observations: [],
          agentThreadId: 'thread-001',
          timestamp: '2024-01-20T10:00:00Z',
          confidence: 0.9,
          importance: 0.8
        }
      ];

      await manager.createEntities(entities1);
      const graph1 = await manager.readGraph();
      expect(graph1.entities).toHaveLength(1);

      await manager.createEntities(entities2);
      const graph2 = await manager.readGraph();
      expect(graph2.entities).toHaveLength(2);
    });
  });

  describe('JSONL storage adapter directly', () => {
    let storage: JsonlStorageAdapter;
    let testDirPath: string;

    beforeEach(async () => {
      testDirPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        `test-jsonl-direct-${Date.now()}`
      );
      await fs.mkdir(testDirPath, { recursive: true });
      storage = new JsonlStorageAdapter(testDirPath);
      await storage.initialize();
    });

    afterEach(async () => {
      try {
        const files = await fs.readdir(testDirPath);
        await Promise.all(files.map(f => fs.unlink(path.join(testDirPath, f))));
        await fs.rmdir(testDirPath);
      } catch (error) {
        // Ignore errors
      }
    });

    it('should persist data to JSONL files', async () => {
      const graph: KnowledgeGraph = {
        entities: [
          { 
            name: 'TestEntity', 
            entityType: 'test', 
            observations: [],
            agentThreadId: 'thread-001',
            timestamp: '2024-01-20T10:00:00Z',
            confidence: 0.9,
            importance: 0.8
          }
        ],
        relations: []
      };

      await storage.saveGraph(graph);

      // Check that file was created
      const files = await fs.readdir(testDirPath);
      expect(files).toContain('thread-thread-001.jsonl');

      // Load and verify
      const loadedGraph = await storage.loadGraph();
      expect(loadedGraph.entities).toHaveLength(1);
      expect(loadedGraph.entities[0].name).toBe('TestEntity');
    });

    it('should handle empty graph', async () => {
      const graph: KnowledgeGraph = {
        entities: [],
        relations: []
      };

      await storage.saveGraph(graph);
      const loadedGraph = await storage.loadGraph();
      
      expect(loadedGraph.entities).toHaveLength(0);
      expect(loadedGraph.relations).toHaveLength(0);
    });
  });
});
