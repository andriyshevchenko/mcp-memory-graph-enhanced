# Storage Abstraction - Usage Examples

This document provides practical examples of using the storage abstraction in the MCP Memory Graph Enhanced project.

## Basic Usage (Default JSONL Storage)

The simplest way to use the knowledge graph is with the default JSONL storage:

```typescript
import { KnowledgeGraphManager } from 'server-memory-enhanced';

// Uses JSONL storage by default
const manager = new KnowledgeGraphManager('/path/to/memory-data');

// Use the manager normally
await manager.createEntities([
  {
    name: 'Alice',
    entityType: 'person',
    observations: [/* ... */],
    agentThreadId: 'thread-001',
    timestamp: new Date().toISOString(),
    confidence: 0.9,
    importance: 0.8
  }
]);

const graph = await manager.readGraph();
console.log(`Total entities: ${graph.entities.length}`);
```

## Custom Storage: In-Memory (for Testing)

For unit tests or temporary data, use an in-memory storage adapter:

```typescript
import { IStorageAdapter, KnowledgeGraphManager, KnowledgeGraph } from 'server-memory-enhanced';

class InMemoryStorageAdapter implements IStorageAdapter {
  private graph: KnowledgeGraph = { entities: [], relations: [] };

  async loadGraph(): Promise<KnowledgeGraph> {
    // Return a deep copy to prevent external mutations
    return JSON.parse(JSON.stringify(this.graph));
  }

  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    // Store a deep copy
    this.graph = JSON.parse(JSON.stringify(graph));
  }

  async initialize(): Promise<void> {
    // No initialization needed
  }
}

// Use in tests
describe('My test suite', () => {
  let manager: KnowledgeGraphManager;
  
  beforeEach(() => {
    manager = new KnowledgeGraphManager('', new InMemoryStorageAdapter());
  });
  
  it('should create entities', async () => {
    await manager.createEntities([/* ... */]);
    // Test assertions...
  });
});
```

## Custom Storage: Database-Backed

Example of a PostgreSQL-backed storage adapter:

```typescript
import { Pool } from 'pg';
import { IStorageAdapter, KnowledgeGraph } from 'server-memory-enhanced';

class PostgresStorageAdapter implements IStorageAdapter {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async initialize(): Promise<void> {
    // Create tables if they don't exist
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS entities (
        name TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        observations JSONB NOT NULL,
        agent_thread_id TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        confidence DECIMAL NOT NULL,
        importance DECIMAL NOT NULL
      )
    `);
    
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS relations (
        id SERIAL PRIMARY KEY,
        from_entity TEXT NOT NULL,
        to_entity TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        agent_thread_id TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        confidence DECIMAL NOT NULL,
        importance DECIMAL NOT NULL,
        UNIQUE(from_entity, to_entity, relation_type)
      )
    `);
  }

  async loadGraph(): Promise<KnowledgeGraph> {
    const entitiesResult = await this.pool.query(
      'SELECT * FROM entities'
    );
    
    const relationsResult = await this.pool.query(
      'SELECT * FROM relations'
    );
    
    return {
      entities: entitiesResult.rows.map(row => ({
        name: row.name,
        entityType: row.entity_type,
        observations: row.observations,
        agentThreadId: row.agent_thread_id,
        timestamp: row.timestamp.toISOString(),
        confidence: parseFloat(row.confidence),
        importance: parseFloat(row.importance)
      })),
      relations: relationsResult.rows.map(row => ({
        from: row.from_entity,
        to: row.to_entity,
        relationType: row.relation_type,
        agentThreadId: row.agent_thread_id,
        timestamp: row.timestamp.toISOString(),
        confidence: parseFloat(row.confidence),
        importance: parseFloat(row.importance)
      }))
    };
  }

  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Clear existing data
      await client.query('DELETE FROM relations');
      await client.query('DELETE FROM entities');
      
      // Insert entities
      for (const entity of graph.entities) {
        await client.query(
          `INSERT INTO entities 
           (name, entity_type, observations, agent_thread_id, timestamp, confidence, importance)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            entity.name,
            entity.entityType,
            JSON.stringify(entity.observations),
            entity.agentThreadId,
            entity.timestamp,
            entity.confidence,
            entity.importance
          ]
        );
      }
      
      // Insert relations
      for (const relation of graph.relations) {
        await client.query(
          `INSERT INTO relations 
           (from_entity, to_entity, relation_type, agent_thread_id, timestamp, confidence, importance)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            relation.from,
            relation.to,
            relation.relationType,
            relation.agentThreadId,
            relation.timestamp,
            relation.confidence,
            relation.importance
          ]
        );
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Usage
const postgresAdapter = new PostgresStorageAdapter(
  'postgresql://user:password@localhost:5432/knowledge_graph'
);
await postgresAdapter.initialize();

const manager = new KnowledgeGraphManager('', postgresAdapter);

// Use normally...
await manager.createEntities([/* ... */]);

// Clean up when done
await postgresAdapter.close();
```

## Future: Neo4j Storage

Once the Neo4j adapter is fully implemented:

```typescript
import { Neo4jStorageAdapter, KnowledgeGraphManager } from 'server-memory-enhanced';
import neo4j from 'neo4j-driver';

const neo4jAdapter = new Neo4jStorageAdapter({
  uri: 'neo4j://localhost:7687',
  username: 'neo4j',
  password: 'password',
  database: 'knowledge-graph'
});

await neo4jAdapter.initialize();

const manager = new KnowledgeGraphManager('', neo4jAdapter);

// Now you can leverage Neo4j's graph capabilities
// Complex relationship queries will be much faster
await manager.findRelationPath('Alice', 'Bob', 5);
await manager.getContext(['CompanyX'], 3);

await neo4jAdapter.close();
```

## Switching Storage Backends

To migrate from one storage to another:

```typescript
import { JsonlStorageAdapter, Neo4jStorageAdapter, KnowledgeGraphManager } from 'server-memory-enhanced';

async function migrateStorage() {
  // Load from JSONL
  const jsonlStorage = new JsonlStorageAdapter('/path/to/memory-data');
  await jsonlStorage.initialize();
  const jsonlManager = new KnowledgeGraphManager('', jsonlStorage);
  const graph = await jsonlManager.readGraph();
  
  console.log(`Migrating ${graph.entities.length} entities and ${graph.relations.length} relations...`);
  
  // Save to Neo4j
  const neo4jStorage = new Neo4jStorageAdapter({
    uri: 'neo4j://localhost:7687',
    username: 'neo4j',
    password: 'password'
  });
  await neo4jStorage.initialize();
  await neo4jStorage.saveGraph(graph);
  
  console.log('Migration complete!');
  
  // Verify
  const neo4jManager = new KnowledgeGraphManager('', neo4jStorage);
  const verifyGraph = await neo4jManager.readGraph();
  console.log(`Verified: ${verifyGraph.entities.length} entities, ${verifyGraph.relations.length} relations`);
}
```

## Environment-Based Storage Selection

Configure storage based on environment:

```typescript
import { 
  KnowledgeGraphManager, 
  JsonlStorageAdapter, 
  Neo4jStorageAdapter,
  InMemoryStorageAdapter 
} from 'server-memory-enhanced';

function createStorageAdapter() {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'test':
      return new InMemoryStorageAdapter();
    
    case 'production':
      return new Neo4jStorageAdapter({
        uri: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!
      });
    
    case 'development':
    default:
      return new JsonlStorageAdapter(
        process.env.MEMORY_DIR_PATH || './memory-data'
      );
  }
}

const storage = createStorageAdapter();
await storage.initialize();
const manager = new KnowledgeGraphManager('', storage);
```

## Best Practices

1. **Always call `initialize()`** on storage adapters before use
2. **Handle cleanup** - Call `close()` on adapters when done (if implemented)
3. **Test with in-memory** - Use in-memory storage for fast unit tests
4. **Validate migrations** - Always verify data after migrating between storage backends
5. **Environment config** - Use environment variables for storage configuration
6. **Error handling** - Implement proper error handling in custom adapters
7. **Transactions** - Use transactions for atomic operations when possible
8. **Deep copies** - Return deep copies from `loadGraph()` to prevent mutations

## Performance Considerations

- **JSONL**: Fast for small datasets, file I/O can be slow for large graphs
- **In-Memory**: Fastest but limited by RAM, lost on restart
- **PostgreSQL**: Good for relational queries, decent performance
- **Neo4j**: Best for graph traversals and complex relationship queries
- **MongoDB**: Good for document-style queries, flexible schema

Choose the storage backend that best fits your query patterns and scale requirements.
