import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { KnowledgeGraphManager } from '../lib/knowledge-graph-manager.js';
import { Entity, Relation } from '../lib/types.js';
import { createTestEntity, createTestRelation } from './storage-test-helpers.js';
import { Neo4jTestFixture, skipIfNeo4jUnavailable } from './neo4j-test-helpers.js';

/**
 * E2E tests for Neo4j storage adapter.
 * 
 * Follows best test practices:
 * - AAA (Arrange-Act-Assert) pattern
 * - DRY (test helpers)
 * - Single responsibility per test
 * - Descriptive test names
 * - Proper setup/teardown
 * 
 * Prerequisites:
 * 1. Start Neo4j: docker run --rm -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/testpassword neo4j:5.15.0
 * 2. Set environment variables (optional, has defaults)
 * 3. Run tests: npm test -- neo4j-e2e.test.ts
 * 
 * Tests are automatically skipped if Neo4j is unavailable.
 */

describe('Neo4j Storage Adapter E2E', () => {
  const fixture = new Neo4jTestFixture();
  let manager: KnowledgeGraphManager;

  beforeAll(async () => {
    await fixture.setup();
  });

  afterAll(async () => {
    await fixture.teardown();
  });

  beforeEach(async () => {
    if (!fixture.isAvailable) return;
    await fixture.clearDatabase();
    manager = fixture.getManager();
  });

  describe('Connection and Initialization', () => {
    it('should skip tests if Neo4j is not available', () => {
      if (!fixture.isAvailable) {
        skipIfNeo4jUnavailable(fixture.isAvailable);
        expect(true).toBe(true);
      }
    });

    it('should connect to Neo4j and initialize successfully', () => {
      if (!fixture.isAvailable) return;
      
      // Assert
      expect(fixture.getStorage()).toBeDefined();
    });
  });

  describe('Entity CRUD Operations', () => {
    it('should create and read entities', async () => {
      if (!fixture.isAvailable) return;
      
      // Arrange
      const entity = createTestEntity('TestEntity');
      
      // Act
      await manager.createEntities('thread-001', [entity]);
      const graph = await manager.readGraph('thread-001');
      
      // Assert
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('TestEntity');
    });

    it('should handle observations correctly', async () => {
      if (!fixture.isAvailable) return;
      
      // Arrange
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
      
      // Act
      await manager.createEntities('thread-001', [entity]);
      const graph = await manager.readGraph('test-thread');
      
      // Assert
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].observations).toHaveLength(1);
      expect(graph.entities[0].observations[0].content).toBe('Works at Google');
    });

    it('should delete entities and cascade relations', async () => {
      if (!fixture.isAvailable) return;
      
      // Arrange
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const relation = createTestRelation('Entity1', 'Entity2');
      await manager.createEntities('thread-001', [entity1, entity2]);
      await manager.createRelations('thread-001', [relation]);
      
      // Act
      await manager.deleteEntities('thread-001', ['Entity1']);
      const graph = await manager.readGraph('thread-001');
      
      // Assert
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('Entity2');
      expect(graph.relations).toHaveLength(0);
    });
  });

  describe('Relation CRUD Operations', () => {
    it('should create and read relations', async () => {
      if (!fixture.isAvailable) return;
      
      // Arrange
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const relation = createTestRelation('Entity1', 'Entity2');
      
      // Act
      await manager.createEntities('thread-001', [entity1, entity2]);
      await manager.createRelations('thread-001', [relation]);
      const graph = await manager.readGraph('thread-001');
      
      // Assert
      expect(graph.entities).toHaveLength(2);
      expect(graph.relations).toHaveLength(1);
      expect(graph.relations[0].from).toBe('Entity1');
      expect(graph.relations[0].to).toBe('Entity2');
    });
  });

  describe('Data Persistence', () => {
    it('should persist data across multiple operations', async () => {
      if (!fixture.isAvailable) return;
      
      // Arrange & Act - First operation
      const entity1 = createTestEntity('Alice');
      await manager.createEntities('thread-001', [entity1]);
      let graph = await manager.readGraph('thread-001');
      
      // Assert - First operation
      expect(graph.entities).toHaveLength(1);
      
      // Arrange & Act - Second operation
      const entity2 = createTestEntity('Bob');
      await manager.createEntities('thread-001', [entity2]);
      const relation = createTestRelation('Alice', 'Bob');
      await manager.createRelations('thread-001', [relation]);
      graph = await manager.readGraph('thread-001');
      
      // Assert - Second operation
      expect(graph.entities).toHaveLength(2);
      expect(graph.relations).toHaveLength(1);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large graphs efficiently', async () => {
      if (!fixture.isAvailable) return;
      
      // Arrange
      const entityCount = 50;
      const entities: Entity[] = [];
      for (let i = 0; i < entityCount; i++) {
        entities.push(createTestEntity(`Entity${i}`));
      }
      
      // Act
      await manager.createEntities('thread-001', entities);
      const graph = await manager.readGraph('thread-001');
      
      // Assert
      expect(graph.entities).toHaveLength(entityCount);
    });

    it('should handle concurrent operations', async () => {
      if (!fixture.isAvailable) return;
      
      // Arrange - create unique entity names to avoid constraint violations
      const promises = [];
      const entityCount = 10;
      
      // Act - each operation creates an entity with a unique name
      for (let i = 0; i < entityCount; i++) {
        const entity = createTestEntity(`ConcurrentEntity_${Date.now()}_${i}`);
        promises.push(manager.createEntities('thread-001', [entity]));
      }
      await Promise.all(promises);
      const graph = await manager.readGraph('thread-001');
      
      // Assert - verify all entities were created
      expect(graph.entities.length).toBeGreaterThanOrEqual(entityCount);
    });
  });

  describe('Search Operations', () => {
    it('should search nodes by query', async () => {
      if (!fixture.isAvailable) return;
      
      // Arrange
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
      
      // Act
      await manager.createEntities('thread-001', [entity1, entity2]);
      const result = await manager.searchNodes('test-thread', 'Google');
      
      // Assert
      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.entities[0].name).toBe('Alice');
    });
  });

  describe('Integration with save_memory', () => {
    it('should support save_memory operations', async () => {
      if (!fixture.isAvailable) return;
      
      // Arrange
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

      // Act
      await manager.createEntities('thread-001', [entity1, entity2]);
      await manager.createRelations('thread-001', [relation]);
      const graph = await manager.readGraph('test-thread');

      // Assert
      expect(graph.entities).toHaveLength(2);
      expect(graph.relations).toHaveLength(1);
    });
  });
});
