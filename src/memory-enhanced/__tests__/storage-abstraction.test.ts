import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager, KnowledgeGraph, IStorageAdapter, JsonlStorageAdapter } from '../index.js';
import {
  createTestEntity,
  createTestRelation,
  createPersonEntity,
  createEntityWithObservation
} from './storage-test-helpers.js';

/**
 * Mock in-memory storage adapter for testing the abstraction
 * Demonstrates the Liskov Substitution Principle (LSP) - can be used anywhere IStorageAdapter is expected
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

/**
 * Test fixture for managing temporary directories
 */
class TestDirectoryFixture {
  private testDirPath?: string;

  async create(prefix: string): Promise<string> {
    this.testDirPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      `${prefix}-${Date.now()}`
    );
    await fs.mkdir(this.testDirPath, { recursive: true });
    return this.testDirPath;
  }

  async cleanup(): Promise<void> {
    if (!this.testDirPath) {
      return;
    }

    try {
      const files = await fs.readdir(this.testDirPath);
      await Promise.all(files.map(f => fs.unlink(path.join(this.testDirPath!, f))));
      await fs.rmdir(this.testDirPath);
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
}

describe('Storage Abstraction', () => {
  describe('JSONL storage adapter (default)', () => {
    let manager: KnowledgeGraphManager;
    let fixture: TestDirectoryFixture;

    beforeEach(async () => {
      fixture = new TestDirectoryFixture();
      const testDirPath = await fixture.create('test-jsonl-storage');
      manager = new KnowledgeGraphManager(testDirPath);
    });

    afterEach(async () => {
      await fixture.cleanup();
    });

    it('should create and read entities using JSONL storage', async () => {
      const entity = createEntityWithObservation('TestEntity', 'test observation');
      
      await manager.createEntities([entity]);
      const graph = await manager.readGraph('thread-001');
      
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('TestEntity');
    });
  });

  describe('In-memory storage adapter (custom)', () => {
    let manager: KnowledgeGraphManager;

    beforeEach(() => {
      const inMemoryStorage = new InMemoryStorageAdapter();
      manager = new KnowledgeGraphManager('', inMemoryStorage);
    });

    it('should create and read entities', async () => {
      const entity = createEntityWithObservation('TestEntity', 'test observation');
      
      await manager.createEntities([entity]);
      const graph = await manager.readGraph('thread-001');
      
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('TestEntity');
    });

    it('should create entities and relations', async () => {
      const alice = createPersonEntity('Alice');
      const bob = createPersonEntity('Bob');
      const relation = createTestRelation('Alice', 'Bob');

      await manager.createEntities([alice, bob]);
      await manager.createRelations([relation]);
      
      const graph = await manager.readGraph('thread-001');
      
      expect(graph.entities).toHaveLength(2);
      expect(graph.relations).toHaveLength(1);
      expect(graph.relations[0].from).toBe('Alice');
      expect(graph.relations[0].to).toBe('Bob');
    });

    it('should handle multiple sequential operations', async () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');

      await manager.createEntities([entity1]);
      const graph1 = await manager.readGraph('thread-001');
      expect(graph1.entities).toHaveLength(1);

      await manager.createEntities([entity2]);
      const graph2 = await manager.readGraph('thread-001');
      expect(graph2.entities).toHaveLength(2);
    });
  });

  describe('JSONL adapter - Direct testing', () => {
    let storage: JsonlStorageAdapter;
    let fixture: TestDirectoryFixture;

    beforeEach(async () => {
      fixture = new TestDirectoryFixture();
      const testDirPath = await fixture.create('test-jsonl-direct');
      storage = new JsonlStorageAdapter(testDirPath);
      await storage.initialize();
    });

    afterEach(async () => {
      await fixture.cleanup();
    });

    it('should persist data to JSONL files', async () => {
      const entity = createTestEntity('TestEntity');
      const graph: KnowledgeGraph = {
        entities: [entity],
        relations: []
      };

      await storage.saveGraph(graph);
      const loadedGraph = await storage.loadGraph();
      
      expect(loadedGraph.entities).toHaveLength(1);
      expect(loadedGraph.entities[0].name).toBe('TestEntity');
    });

    it('should handle empty graph', async () => {
      const emptyGraph: KnowledgeGraph = {
        entities: [],
        relations: []
      };

      await storage.saveGraph(emptyGraph);
      const loadedGraph = await storage.loadGraph();
      
      expect(loadedGraph.entities).toHaveLength(0);
      expect(loadedGraph.relations).toHaveLength(0);
    });
  });
});
