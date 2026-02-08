/**
 * Graph reading operations
 */

import { KnowledgeGraph, Entity, Relation, Observation } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';

/**
 * Default threshold for marking items as ARCHIVED
 * Items with importance below this but >= minImportance get ARCHIVED status
 */
export const ARCHIVED_THRESHOLD = 0.1;

/**
 * Check if an observation has a status field
 */
function hasStatus(obs: Observation): boolean {
  return obs.status !== undefined;
}

/**
 * Check if an entity or any of its observations has a status field
 */
function entityHasStatus(entity: Entity): boolean {
  return entity.status !== undefined || entity.observations.some(hasStatus);
}

/**
 * Check if a relation has a status field
 */
function relationHasStatus(relation: Relation): boolean {
  return relation.status !== undefined;
}

/**
 * Strip status from an observation (used to clean persisted status values)
 */
function stripObservationStatus(obs: Observation): Observation {
  if (!hasStatus(obs)) return obs;
  const { status: _oldStatus, ...obsWithoutStatus } = obs;
  return obsWithoutStatus;
}

/**
 * Strip status from an entity and its observations (used to clean persisted status values)
 * Optimized to avoid unnecessary copies when only entity status needs stripping
 */
function stripEntityStatus(entity: Entity): Entity {
  if (!entityHasStatus(entity)) return entity;
  
  const entityHasOwnStatus = entity.status !== undefined;
  const observationsHaveStatus = entity.observations.some(hasStatus);
  
  // If only observations have status, keep entity as-is and just map observations
  if (!entityHasOwnStatus && observationsHaveStatus) {
    return {
      ...entity,
      observations: entity.observations.map(stripObservationStatus),
    };
  }
  
  // If only entity has status, strip it but keep observations as-is
  if (entityHasOwnStatus && !observationsHaveStatus) {
    const { status: _oldStatus, ...entityWithoutStatus } = entity;
    return entityWithoutStatus;
  }
  
  // Both entity and observations have status
  const { status: _oldStatus, ...entityWithoutStatus } = entity;
  return {
    ...entityWithoutStatus,
    observations: entity.observations.map(stripObservationStatus),
  };
}

/**
 * Strip status from a relation (used to clean persisted status values)
 */
function stripRelationStatus(relation: Relation): Relation {
  if (!relationHasStatus(relation)) return relation;
  const { status: _oldStatus, ...relationWithoutStatus } = relation;
  return relationWithoutStatus;
}

/**
 * Strip status from all entities and relations in a graph (used to clean persisted status values)
 * Optimized to avoid unnecessary deep copies when no status fields exist
 */
export function stripGraphStatus(graph: KnowledgeGraph): KnowledgeGraph {
  // Check if any items have status fields - if not, return as-is
  const hasAnyStatus = graph.entities.some(entityHasStatus) || graph.relations.some(relationHasStatus);
  if (!hasAnyStatus) {
    return graph;
  }
  
  return {
    entities: graph.entities.map(stripEntityStatus),
    relations: graph.relations.map(stripRelationStatus),
  };
}

/**
 * Read the knowledge graph filtered by threadId for thread isolation
 * and optionally filtered by minimum importance threshold
 */
export async function readGraph(
  storage: IStorageAdapter, 
  threadId: string,
  minImportance: number = ARCHIVED_THRESHOLD
): Promise<KnowledgeGraph> {
  const graph = await storage.loadGraph();
  
  // Filter entities by threadId and importance
  const filteredEntities = graph.entities
    .filter(e => e.agentThreadId === threadId)
    .filter(e => e.importance >= minImportance)
    .map(entity => {
      // Add ARCHIVED status if importance is less than ARCHIVED_THRESHOLD but >= minImportance.
      // Otherwise, explicitly clear status so pre-existing values don't leak through.
      const isArchived = entity.importance < ARCHIVED_THRESHOLD && entity.importance >= minImportance;
      const { status: _oldStatus, ...entityWithoutStatus } = entity;
      const entityWithStatus = {
        ...entityWithoutStatus,
        ...(isArchived ? { status: 'ARCHIVED' as const } : {}),
      };
      
      // Process observations: filter by importance and add ARCHIVED status
      // Defensive: handle potential legacy string observations
      entityWithStatus.observations = entity.observations
        .filter(obs => {
          // Keep legacy string observations (defensive against legacy data)
          if (typeof obs !== 'object' || obs === null) return true;
          
          // Use observation importance if set, otherwise inherit from entity
          const obsImportance = obs.importance !== undefined ? obs.importance : entity.importance;
          return obsImportance >= minImportance;
        })
        .map(obs => {
          // Pass through legacy string observations unchanged
          if (typeof obs !== 'object' || obs === null) return obs;
          
          const obsImportance = obs.importance !== undefined ? obs.importance : entity.importance;
          const isObsArchived = obsImportance < ARCHIVED_THRESHOLD && obsImportance >= minImportance;
          const { status: _oldObsStatus, ...obsWithoutStatus } = obs;
          return {
            ...obsWithoutStatus,
            ...(isObsArchived ? { status: 'ARCHIVED' as const } : {}),
          };
        });
      
      return entityWithStatus;
    });
  
  // Create a Set of filtered entity names for quick lookup
  const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
  // Filter relations to only include those between filtered entities, from the same thread, and by importance
  const filteredRelations = graph.relations
    .filter(r => 
      r.agentThreadId === threadId &&
      filteredEntityNames.has(r.from) && 
      filteredEntityNames.has(r.to) &&
      r.importance >= minImportance
    )
    .map(relation => {
      // Add ARCHIVED status if importance is less than ARCHIVED_THRESHOLD but >= minImportance.
      // Otherwise, explicitly clear status so pre-existing values don't leak through.
      const isArchived = relation.importance < ARCHIVED_THRESHOLD && relation.importance >= minImportance;
      const { status: _oldStatus, ...relationWithoutStatus } = relation;
      return {
        ...relationWithoutStatus,
        ...(isArchived ? { status: 'ARCHIVED' as const } : {}),
      };
    });
  
  return {
    entities: filteredEntities,
    relations: filteredRelations
  };
}
