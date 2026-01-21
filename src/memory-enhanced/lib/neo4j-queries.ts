/**
 * Neo4j Cypher Queries
 * 
 * Centralizes all Cypher queries for the Neo4j storage adapter.
 * Following Single Responsibility Principle - this module is responsible only for query definitions.
 */

/**
 * Constraint and index queries for schema initialization
 */
export const SCHEMA_QUERIES = {
  createUniqueConstraint: 'CREATE CONSTRAINT entity_name_unique IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE',
  createEntityTypeIndex: 'CREATE INDEX entity_type_idx IF NOT EXISTS FOR (e:Entity) ON (e.entityType)',
  createThreadIndex: 'CREATE INDEX entity_thread_idx IF NOT EXISTS FOR (e:Entity) ON (e.agentThreadId)',
  createTimestampIndex: 'CREATE INDEX entity_timestamp_idx IF NOT EXISTS FOR (e:Entity) ON (e.timestamp)',
} as const;

/**
 * Entity queries
 */
export const ENTITY_QUERIES = {
  loadAll: `
    MATCH (e:Entity)
    RETURN e.name as name, 
           e.entityType as entityType,
           e.observations as observations,
           e.agentThreadId as agentThreadId,
           e.timestamp as timestamp,
           e.confidence as confidence,
           e.importance as importance
  `,
  
  create: `
    CREATE (e:Entity {
      name: $name,
      entityType: $entityType,
      observations: $observations,
      agentThreadId: $agentThreadId,
      timestamp: $timestamp,
      confidence: $confidence,
      importance: $importance
    })
  `,
} as const;

/**
 * Relation queries
 */
export const RELATION_QUERIES = {
  loadAll: `
    MATCH (from:Entity)-[r:RELATES_TO]->(to:Entity)
    RETURN from.name as from,
           to.name as to,
           r.relationType as relationType,
           r.agentThreadId as agentThreadId,
           r.timestamp as timestamp,
           r.confidence as confidence,
           r.importance as importance
  `,
  
  create: `
    MATCH (from:Entity {name: $from})
    MATCH (to:Entity {name: $to})
    CREATE (from)-[r:RELATES_TO {
      relationType: $relationType,
      agentThreadId: $agentThreadId,
      timestamp: $timestamp,
      confidence: $confidence,
      importance: $importance
    }]->(to)
  `,
} as const;

/**
 * Maintenance queries
 */
export const MAINTENANCE_QUERIES = {
  deleteAll: 'MATCH (n:Entity) DETACH DELETE n',
} as const;
