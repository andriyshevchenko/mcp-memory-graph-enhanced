import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Neo4jStorageAdapter } from '../lib/neo4j-storage-adapter.js';
import { KnowledgeGraphManager } from '../lib/knowledge-graph-manager.js';
import { Entity, Relation, KnowledgeGraph } from '../lib/types.js';
import { createTestEntity, createTestRelation } from './storage-test-helpers.js';

/**
 * E2E tests for Neo4j storage adapter
 * 
 * These tests require a running Neo4j instance.
 * To run these tests:
 * 
 * 1. Start Neo4j with Docker:
 *    docker run --rm -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/testpassword neo4j:5.15.0
 * 
 * 2. Set environment variables:
 *    export NEO4J_URI=neo4j://localhost:7687
 *    export NEO4J_USERNAME=neo4j
 *    export NEO4J_PASSWORD=testpassword
 * 
 * 3. Run tests:
 *    npm test -- neo4j-e2e.test.ts
 * 
 * These tests will be skipped if Neo4j is not available.
 */

// Check if Neo4j is configured
const neo4jUri = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const neo4jUsername = process.env.NEO4J_USERNAME || 'neo4j';
const neo4jPassword = process.env.NEO4J_PASSWORD || 'testpassword';
const neo4jDatabase = process.env.NEO4J_DATABASE;

// Flag to skip tests if Neo4j is not available
let neo4jAvailable = false;

describe('Neo4j Storage Adapter E2E', () => {
  let storage: Neo4jStorageAdapter;
  let manager: KnowledgeGraphManager;

  beforeAll(async () => {
    // Try to connect to Neo4j
    try {
      storage = new Neo4jStorageAdapter({
        uri: neo4jUri,
        username: neo4jUsername,
        password: neo4jPassword,
        database: neo4jDatabase
      });
      
      await storage.initialize();
      neo4jAvailable = true;
      console.log('Neo4j connection successful');
    } catch (error) {
      console.warn('Neo4j not available, skipping E2E tests:', error instanceof Error ? error.message : String(error));
      neo4jAvailable = false;
    }
  });

  afterAll(async () => {
    if (neo4jAvailable && storage) {
      // Clean up: delete all test data
      try {
        await storage.saveGraph({ entities: [], relations: [] });
        await storage.close();
      } catch (error) {
        console.warn('Error during cleanup:', error);
      }
    }
  });

  beforeEach(async () => {
    if (neo4jAvailable && storage) {
      // Clear the database before each test
      await storage.saveGraph({ entities: [], relations: [] });
      manager = new KnowledgeGraphManager('', storage);
    }
  });

  it('should skip tests if Neo4j is not available', () => {
    if (!neo4jAvailable) {
      console.log('Neo4j not available - tests skipped');
      expect(true).toBe(true);
    }
  });

  it('should connect to Neo4j and initialize', async () => {
    if (!neo4jAvailable) return;
    
    expect(storage).toBeDefined();
  });

  it('should create and read entities', async () => {
    if (!neo4jAvailable) return;
    
    const entity = createTestEntity('TestEntity');
    await manager.createEntities([entity]);
    
    const graph = await manager.readGraph();
    expect(graph.entities).toHaveLength(1);
    expect(graph.entities[0].name).toBe('TestEntity');
  });

  it('should create and read relations', async () => {
    if (!neo4jAvailable) return;
    
    const entity1 = createTestEntity('Entity1');
    const entity2 = createTestEntity('Entity2');
    const relation = createTestRelation('Entity1', 'Entity2');
    
    await manager.createEntities([entity1, entity2]);
    await manager.createRelations([relation]);
    
    const graph = await manager.readGraph();
    expect(graph.entities).toHaveLength(2);
    expect(graph.relations).toHaveLength(1);
    expect(graph.relations[0].from).toBe('Entity1');
    expect(graph.relations[0].to).toBe('Entity2');
  });

  it('should persist data across multiple operations', async () => {
    if (!neo4jAvailable) return;
    
    // First operation: create entities
    const entity1 = createTestEntity('Alice');
    await manager.createEntities([entity1]);
    
    let graph = await manager.readGraph();
    expect(graph.entities).toHaveLength(1);
    
    // Second operation: create more entities and relations
    const entity2 = createTestEntity('Bob');
    await manager.createEntities([entity2]);
    
    const relation = createTestRelation('Alice', 'Bob');
    await manager.createRelations([relation]);
    
    graph = await manager.readGraph();
    expect(graph.entities).toHaveLength(2);
    expect(graph.relations).toHaveLength(1);
  });

  it('should handle observations correctly', async () => {
    if (!neo4jAvailable) return;
    
    const entity: Entity = {
      name: 'TestPerson',
      entityType: 'Person',
      observations: [
        {
          id: 'obs_1',
          content: 'Works at Google',
          timestamp: new Date().toISOString(),
          version: 1,
          agentThreadId: 'test-thread'
        }
      ],
      agentThreadId: 'test-thread',
      timestamp: new Date().toISOString(),
      confidence: 0.9,
      importance: 0.8
    };
    
    await manager.createEntities([entity]);
    
    const graph = await manager.readGraph();
    expect(graph.entities).toHaveLength(1);
    expect(graph.entities[0].observations).toHaveLength(1);
    expect(graph.entities[0].observations[0].content).toBe('Works at Google');
  });

  it('should delete entities and cascade relations', async () => {
    if (!neo4jAvailable) return;
    
    const entity1 = createTestEntity('Entity1');
    const entity2 = createTestEntity('Entity2');
    const relation = createTestRelation('Entity1', 'Entity2');
    
    await manager.createEntities([entity1, entity2]);
    await manager.createRelations([relation]);
    
    // Delete one entity
    await manager.deleteEntities(['Entity1']);
    
    const graph = await manager.readGraph();
    expect(graph.entities).toHaveLength(1);
    expect(graph.entities[0].name).toBe('Entity2');
    // Relations should be removed when entities are deleted
    expect(graph.relations).toHaveLength(0);
  });

  it('should handle large graphs', async () => {
    if (!neo4jAvailable) return;
    
    // Create 50 entities
    const entities: Entity[] = [];
    for (let i = 0; i < 50; i++) {
      entities.push(createTestEntity(`Entity${i}`));
    }
    
    await manager.createEntities(entities);
    
    const graph = await manager.readGraph();
    expect(graph.entities).toHaveLength(50);
  });

  it('should search nodes by query', async () => {
    if (!neo4jAvailable) return;
    
    const entity1: Entity = {
      name: 'Alice',
      entityType: 'Person',
      observations: [
        {
          id: 'obs_1',
          content: 'Works at Google',
          timestamp: new Date().toISOString(),
          version: 1,
          agentThreadId: 'test-thread'
        }
      ],
      agentThreadId: 'test-thread',
      timestamp: new Date().toISOString(),
      confidence: 0.9,
      importance: 0.8
    };
    
    const entity2: Entity = {
      name: 'Bob',
      entityType: 'Person',
      observations: [
        {
          id: 'obs_2',
          content: 'Works at Microsoft',
          timestamp: new Date().toISOString(),
          version: 1,
          agentThreadId: 'test-thread'
        }
      ],
      agentThreadId: 'test-thread',
      timestamp: new Date().toISOString(),
      confidence: 0.9,
      importance: 0.8
    };
    
    await manager.createEntities([entity1, entity2]);
    
    const result = await manager.searchNodes('Google');
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.entities[0].name).toBe('Alice');
  });

  it('should handle concurrent operations', async () => {
    if (!neo4jAvailable) return;
    
    // Create multiple entities concurrently
    const promises = [];
    for (let i = 0; i < 10; i++) {
      const entity = createTestEntity(`ConcurrentEntity${i}`);
      promises.push(manager.createEntities([entity]));
    }
    
    await Promise.all(promises);
    
    const graph = await manager.readGraph();
    expect(graph.entities).toHaveLength(10);
  });

  it('should support save_memory operations', async () => {
    if (!neo4jAvailable) return;
    
    // Test using save_memory-style operations
    const entity1: Entity = {
      name: 'Company',
      entityType: 'Organization',
      observations: [
        {
          id: 'obs_1',
          content: 'Tech company',
          timestamp: new Date().toISOString(),
          version: 1,
          agentThreadId: 'test-thread'
        }
      ],
      agentThreadId: 'test-thread',
      timestamp: new Date().toISOString(),
      confidence: 0.9,
      importance: 0.8
    };

    const entity2: Entity = {
      name: 'Employee',
      entityType: 'Person',
      observations: [
        {
          id: 'obs_2',
          content: 'Software Engineer',
          timestamp: new Date().toISOString(),
          version: 1,
          agentThreadId: 'test-thread'
        }
      ],
      agentThreadId: 'test-thread',
      timestamp: new Date().toISOString(),
      confidence: 0.9,
      importance: 0.8
    };

    const relation: Relation = {
      from: 'Employee',
      to: 'Company',
      relationType: 'works_at',
      agentThreadId: 'test-thread',
      timestamp: new Date().toISOString(),
      confidence: 0.9,
      importance: 0.8
    };

    await manager.createEntities([entity1, entity2]);
    await manager.createRelations([relation]);

    const graph = await manager.readGraph();
    expect(graph.entities).toHaveLength(2);
    expect(graph.relations).toHaveLength(1);
  });
});
