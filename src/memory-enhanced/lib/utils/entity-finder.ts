/**
 * Utilities for finding entities and observations in the knowledge graph
 */

import { Entity, KnowledgeGraph, Observation } from '../types.js';

/**
 * Find an entity by name in the knowledge graph.
 * @param graph - The knowledge graph to search
 * @param entityName - Name of the entity to find
 * @returns The found entity
 * @throws Error if entity not found
 */
export function findEntity(graph: KnowledgeGraph, entityName: string): Entity {
  const entity = graph.entities.find(e => e.name === entityName);
  if (!entity) {
    throw new Error(`Entity '${entityName}' not found`);
  }
  return entity;
}

/**
 * Find an observation by ID within an entity.
 * @param entity - The entity containing the observation
 * @param observationId - ID of the observation to find
 * @returns The found observation
 * @throws Error if observation not found
 */
export function findObservation(entity: Entity, observationId: string): Observation {
  const observation = entity.observations.find(o => o.id === observationId);
  if (!observation) {
    throw new Error(`Observation '${observationId}' not found in entity '${entity.name}'`);
  }
  return observation;
}
