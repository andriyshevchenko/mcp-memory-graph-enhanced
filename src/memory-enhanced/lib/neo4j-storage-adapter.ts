/**
 * Neo4j Storage Adapter
 * 
 * Production-ready implementation of the Neo4j storage adapter.
 * Provides full CRUD operations for the knowledge graph using Neo4j.
 * 
 * Example usage:
 * ```typescript
 * import { Neo4jStorageAdapter } from './neo4j-storage-adapter.js';
 * import { KnowledgeGraphManager } from './knowledge-graph-manager.js';
 * 
 * const neo4jAdapter = new Neo4jStorageAdapter({
 *   uri: 'neo4j://localhost:7687',
 *   username: 'neo4j',
 *   password: 'password'
 * });
 * 
 * await neo4jAdapter.initialize();
 * const manager = new KnowledgeGraphManager('', neo4jAdapter);
 * ```
 */

import neo4j, { Driver, Session } from 'neo4j-driver';
import { Entity, Relation, KnowledgeGraph, Observation } from './types.js';
import { IStorageAdapter } from './storage-interface.js';

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

/**
 * Neo4j-based storage adapter for the knowledge graph
 */
export class Neo4jStorageAdapter implements IStorageAdapter {
  private config: Neo4jConfig;
  private driver: Driver | null = null;

  constructor(config: Neo4jConfig) {
    this.config = config;
  }

  /**
   * Initialize Neo4j connection
   */
  async initialize(): Promise<void> {
    try {
      // Initialize Neo4j driver
      this.driver = neo4j.driver(
        this.config.uri,
        neo4j.auth.basic(this.config.username, this.config.password)
      );
      
      // Verify connectivity
      await this.driver.verifyConnectivity();
      
      // Create constraints and indexes
      const session = this.driver.session({ database: this.config.database });
      try {
        // Create unique constraint on entity name
        await session.run(
          'CREATE CONSTRAINT entity_name_unique IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE'
        );
        
        // Create indexes for better query performance
        await session.run(
          'CREATE INDEX entity_type_idx IF NOT EXISTS FOR (e:Entity) ON (e.entityType)'
        );
        await session.run(
          'CREATE INDEX entity_thread_idx IF NOT EXISTS FOR (e:Entity) ON (e.agentThreadId)'
        );
        await session.run(
          'CREATE INDEX entity_timestamp_idx IF NOT EXISTS FOR (e:Entity) ON (e.timestamp)'
        );
      } finally {
        await session.close();
      }
    } catch (error) {
      throw new Error(`Failed to initialize Neo4j connection: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Serialize observations for Neo4j storage
   */
  private serializeObservations(observations: Observation[]): string {
    return JSON.stringify(observations);
  }

  /**
   * Deserialize observations from Neo4j storage
   */
  private deserializeObservations(observationsJson: string): Observation[] {
    try {
      return JSON.parse(observationsJson);
    } catch {
      return [];
    }
  }

  /**
   * Load the complete knowledge graph from Neo4j
   */
  async loadGraph(): Promise<KnowledgeGraph> {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized. Call initialize() first.');
    }

    const session = this.driver.session({ database: this.config.database });
    try {
      // Load all entities
      const entitiesResult = await session.run(`
        MATCH (e:Entity)
        RETURN e.name as name, 
               e.entityType as entityType,
               e.observations as observations,
               e.agentThreadId as agentThreadId,
               e.timestamp as timestamp,
               e.confidence as confidence,
               e.importance as importance
      `);

      const entities: Entity[] = entitiesResult.records.map(record => ({
        name: record.get('name'),
        entityType: record.get('entityType'),
        observations: this.deserializeObservations(record.get('observations')),
        agentThreadId: record.get('agentThreadId'),
        timestamp: record.get('timestamp'),
        confidence: record.get('confidence'),
        importance: record.get('importance')
      }));

      // Load all relations
      const relationsResult = await session.run(`
        MATCH (from:Entity)-[r:RELATES_TO]->(to:Entity)
        RETURN from.name as from,
               to.name as to,
               r.relationType as relationType,
               r.agentThreadId as agentThreadId,
               r.timestamp as timestamp,
               r.confidence as confidence,
               r.importance as importance
      `);

      const relations: Relation[] = relationsResult.records.map(record => ({
        from: record.get('from'),
        to: record.get('to'),
        relationType: record.get('relationType'),
        agentThreadId: record.get('agentThreadId'),
        timestamp: record.get('timestamp'),
        confidence: record.get('confidence'),
        importance: record.get('importance')
      }));

      return { entities, relations };
    } finally {
      await session.close();
    }
  }

  /**
   * Save the complete knowledge graph to Neo4j
   */
  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized. Call initialize() first.');
    }

    const session = this.driver.session({ database: this.config.database });
    try {
      // Use a transaction for atomic operations
      await session.executeWrite(async (tx) => {
        // Delete all existing data
        await tx.run('MATCH (n:Entity) DETACH DELETE n');

        // Create all entities
        for (const entity of graph.entities) {
          await tx.run(`
            CREATE (e:Entity {
              name: $name,
              entityType: $entityType,
              observations: $observations,
              agentThreadId: $agentThreadId,
              timestamp: $timestamp,
              confidence: $confidence,
              importance: $importance
            })
          `, {
            name: entity.name,
            entityType: entity.entityType,
            observations: this.serializeObservations(entity.observations),
            agentThreadId: entity.agentThreadId,
            timestamp: entity.timestamp,
            confidence: entity.confidence,
            importance: entity.importance
          });
        }

        // Create all relations
        for (const relation of graph.relations) {
          await tx.run(`
            MATCH (from:Entity {name: $from})
            MATCH (to:Entity {name: $to})
            CREATE (from)-[r:RELATES_TO {
              relationType: $relationType,
              agentThreadId: $agentThreadId,
              timestamp: $timestamp,
              confidence: $confidence,
              importance: $importance
            }]->(to)
          `, {
            from: relation.from,
            to: relation.to,
            relationType: relation.relationType,
            agentThreadId: relation.agentThreadId,
            timestamp: relation.timestamp,
            confidence: relation.confidence,
            importance: relation.importance
          });
        }
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Close Neo4j connection
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }
}

/**
 * Example of how this adapter could be used:
 * 
 * const neo4jAdapter = new Neo4jStorageAdapter({
 *   uri: 'neo4j://localhost:7687',
 *   username: 'neo4j',
 *   password: 'password',
 *   database: 'knowledge-graph'
 * });
 * 
 * await neo4jAdapter.initialize();
 * 
 * const manager = new KnowledgeGraphManager('', neo4jAdapter);
 * 
 * // Use the manager as normal - all operations will now use Neo4j
 * await manager.createEntities([...]);
 * const graph = await manager.readGraph();
 * 
 * // Clean up when done
 * await neo4jAdapter.close();
 */
