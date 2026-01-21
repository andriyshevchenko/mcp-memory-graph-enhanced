/**
 * Neo4j Storage Adapter
 * 
 * Production-ready implementation of the Neo4j storage adapter.
 * Provides full CRUD operations for the knowledge graph using Neo4j.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility: Adapter only handles Neo4j storage operations
 * - Open/Closed: Can be extended without modification through IStorageAdapter
 * - Liskov Substitution: Can replace any IStorageAdapter implementation
 * - Interface Segregation: Implements minimal IStorageAdapter interface
 * - Dependency Inversion: Depends on IStorageAdapter abstraction
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
import { SCHEMA_QUERIES, ENTITY_QUERIES, RELATION_QUERIES, MAINTENANCE_QUERIES } from './neo4j-queries.js';
import { NEO4J_ERROR_MESSAGES } from './storage-config.js';

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

/**
 * Neo4j-based storage adapter for the knowledge graph.
 * Follows Single Responsibility Principle - only handles Neo4j storage operations.
 */
export class Neo4jStorageAdapter implements IStorageAdapter {
  private readonly config: Neo4jConfig;
  private driver: Driver | null = null;

  constructor(config: Neo4jConfig) {
    this.config = config;
  }

  /**
   * Initialize Neo4j connection and schema.
   * Creates constraints and indexes for optimal performance.
   */
  async initialize(): Promise<void> {
    try {
      await this.initializeDriver();
      await this.verifyConnection();
      await this.initializeSchema();
    } catch (error) {
      throw new Error(`${NEO4J_ERROR_MESSAGES.CONNECTION_FAILED}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Initialize the Neo4j driver.
   * Extracted for better testability and separation of concerns.
   */
  private async initializeDriver(): Promise<void> {
    this.driver = neo4j.driver(
      this.config.uri,
      neo4j.auth.basic(this.config.username, this.config.password)
    );
  }

  /**
   * Verify connection to Neo4j.
   * Extracted for better error handling and testability.
   */
  private async verifyConnection(): Promise<void> {
    if (!this.driver) {
      throw new Error(NEO4J_ERROR_MESSAGES.NOT_INITIALIZED);
    }
    await this.driver.verifyConnectivity();
  }

  /**
   * Initialize database schema (constraints and indexes).
   * Extracted for Single Responsibility Principle.
   */
  private async initializeSchema(): Promise<void> {
    const session = await this.createSession();
    try {
      await session.run(SCHEMA_QUERIES.createUniqueConstraint);
      await session.run(SCHEMA_QUERIES.createEntityTypeIndex);
      await session.run(SCHEMA_QUERIES.createThreadIndex);
      await session.run(SCHEMA_QUERIES.createTimestampIndex);
    } finally {
      await session.close();
    }
  }

  /**
   * Create a Neo4j session.
   * Centralized session creation for DRY principle.
   */
  private async createSession(): Promise<Session> {
    this.ensureDriverInitialized();
    return this.driver!.session({ database: this.config.database });
  }

  /**
   * Ensure driver is initialized.
   * Guard clause for better error handling.
   */
  private ensureDriverInitialized(): void {
    if (!this.driver) {
      throw new Error(NEO4J_ERROR_MESSAGES.NOT_INITIALIZED);
    }
  }

  /**
   * Serialize observations for Neo4j storage.
   * Extracted for testability and reusability (DRY).
   */
  private serializeObservations(observations: Observation[]): string {
    return JSON.stringify(observations);
  }

  /**
   * Deserialize observations from Neo4j storage.
   * Extracted for testability and reusability (DRY).
   * Returns empty array on parse error for robustness.
   */
  private deserializeObservations(observationsJson: string): Observation[] {
    try {
      return JSON.parse(observationsJson);
    } catch {
      return [];
    }
  }

  /**
   * Map Neo4j record to Entity object.
   * Extracted for Single Responsibility Principle and DRY.
   */
  private mapRecordToEntity(record: any): Entity {
    return {
      name: record.get('name'),
      entityType: record.get('entityType'),
      observations: this.deserializeObservations(record.get('observations')),
      agentThreadId: record.get('agentThreadId'),
      timestamp: record.get('timestamp'),
      confidence: record.get('confidence'),
      importance: record.get('importance')
    };
  }

  /**
   * Map Neo4j record to Relation object.
   * Extracted for Single Responsibility Principle and DRY.
   */
  private mapRecordToRelation(record: any): Relation {
    return {
      from: record.get('from'),
      to: record.get('to'),
      relationType: record.get('relationType'),
      agentThreadId: record.get('agentThreadId'),
      timestamp: record.get('timestamp'),
      confidence: record.get('confidence'),
      importance: record.get('importance')
    };
  }

  /**
   * Load the complete knowledge graph from Neo4j.
   * Delegates to specialized methods for clarity.
   */
  async loadGraph(): Promise<KnowledgeGraph> {
    this.ensureDriverInitialized();
    
    const session = await this.createSession();
    try {
      const entities = await this.loadEntities(session);
      const relations = await this.loadRelations(session);
      return { entities, relations };
    } finally {
      await session.close();
    }
  }

  /**
   * Load all entities from Neo4j.
   * Extracted for Single Responsibility Principle.
   */
  private async loadEntities(session: Session): Promise<Entity[]> {
    const result = await session.run(ENTITY_QUERIES.loadAll);
    return result.records.map(record => this.mapRecordToEntity(record));
  }

  /**
   * Load all relations from Neo4j.
   * Extracted for Single Responsibility Principle.
   */
  private async loadRelations(session: Session): Promise<Relation[]> {
    const result = await session.run(RELATION_QUERIES.loadAll);
    return result.records.map(record => this.mapRecordToRelation(record));
  }

  /**
   * Save the complete knowledge graph to Neo4j.
   * Uses transactions for atomicity.
   */
  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    this.ensureDriverInitialized();
    
    const session = await this.createSession();
    try {
      await session.executeWrite(async (tx) => {
        await this.clearDatabase(tx);
        await this.saveEntities(tx, graph.entities);
        await this.saveRelations(tx, graph.relations);
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Clear all data from the database.
   * Extracted for Single Responsibility Principle.
   */
  private async clearDatabase(tx: any): Promise<void> {
    await tx.run(MAINTENANCE_QUERIES.deleteAll);
  }

  /**
   * Save all entities to Neo4j.
   * Extracted for Single Responsibility Principle and testability.
   */
  private async saveEntities(tx: any, entities: Entity[]): Promise<void> {
    for (const entity of entities) {
      await this.saveEntity(tx, entity);
    }
  }

  /**
   * Save a single entity to Neo4j.
   * Extracted for DRY and testability.
   */
  private async saveEntity(tx: any, entity: Entity): Promise<void> {
    await tx.run(ENTITY_QUERIES.create, {
      name: entity.name,
      entityType: entity.entityType,
      observations: this.serializeObservations(entity.observations),
      agentThreadId: entity.agentThreadId,
      timestamp: entity.timestamp,
      confidence: entity.confidence,
      importance: entity.importance
    });
  }

  /**
   * Save all relations to Neo4j.
   * Extracted for Single Responsibility Principle and testability.
   */
  private async saveRelations(tx: any, relations: Relation[]): Promise<void> {
    for (const relation of relations) {
      await this.saveRelation(tx, relation);
    }
  }

  /**
   * Save a single relation to Neo4j.
   * Extracted for DRY and testability.
   */
  private async saveRelation(tx: any, relation: Relation): Promise<void> {
    await tx.run(RELATION_QUERIES.create, {
      from: relation.from,
      to: relation.to,
      relationType: relation.relationType,
      agentThreadId: relation.agentThreadId,
      timestamp: relation.timestamp,
      confidence: relation.confidence,
      importance: relation.importance
    });
  }

  /**
   * Close Neo4j connection.
   * Properly cleans up resources.
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }
}
