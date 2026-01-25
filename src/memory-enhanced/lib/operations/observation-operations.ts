/**
 * Observation CRUD operations
 */

import { Observation } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';
import { randomUUID } from 'crypto';
import { findEntity, findObservation } from '../utils/entity-finder.js';
import { validateObservationNotSuperseded, createObservationVersion } from '../utils/observation-validator.js';

/**
 * Add observations to entities
 * Checks for duplicate content and creates version chains when content is updated
 * Thread parameter is used for validation to ensure only entities in the thread are modified
 */
export async function addObservations(
  storage: IStorageAdapter,
  threadId: string,
  observations: {
    entityName: string;
    contents: string[];
    agentThreadId: string;
    timestamp: string;
    confidence: number;
    importance: number;
  }[]
): Promise<{ entityName: string; addedObservations: Observation[] }[]> {
  const graph = await storage.loadGraph();
  const results = observations.map(o => {
    // Find entity - thread validation happens here to ensure we only modify entities from this thread
    const entity = graph.entities.find(e => e.name === o.entityName && e.agentThreadId === threadId);
    if (!entity) {
      throw new Error(`Entity with name ${o.entityName} not found in thread ${threadId}`);
    }
    
    // Check for existing observations with same content to create version chain
    const newObservations: Observation[] = [];
    // Build a Set of existing observation contents for efficient lookup (single-pass)
    const existingContents = entity.observations.reduce(
      (set, obs) => {
        if (!obs.superseded_by) {
          set.add(obs.content);
        }
        return set;
      },
      new Set<string>()
    );
    
    for (const content of o.contents) {
      // Check if observation with this content already exists (latest version)
      if (existingContents.has(content)) {
        // Don't add duplicate - observation with this content already exists
        // Versioning is for UPDATES to content, not for re-asserting the same content
        continue;
      }
      
      // Create brand new observation
      const newObs: Observation = {
        id: `obs_${randomUUID()}`,
        content: content,
        timestamp: o.timestamp,
        version: 1,
        agentThreadId: o.agentThreadId,
        confidence: o.confidence,
        importance: o.importance
      };
      
      entity.observations.push(newObs);
      newObservations.push(newObs);
    }
    
    // Update entity metadata
    entity.timestamp = o.timestamp;
    entity.confidence = Math.max(entity.confidence, o.confidence);
    entity.importance = Math.max(entity.importance, o.importance);
    
    return { entityName: o.entityName, addedObservations: newObservations };
  });
  await storage.saveGraph(graph);
  return results;
}

/**
 * Delete observations from entities
 * Supports deletion by content (backward compatibility) or by ID
 * Thread parameter is used for validation to ensure only entities in the thread are modified
 */
export async function deleteObservations(
  storage: IStorageAdapter,
  threadId: string,
  deletions: { entityName: string; observations: string[] }[]
): Promise<void> {
  const graph = await storage.loadGraph();
  deletions.forEach(d => {
    // Find entity - thread validation happens here to ensure we only modify entities from this thread
    const entity = graph.entities.find(e => e.name === d.entityName && e.agentThreadId === threadId);
    if (entity) {
      // Delete observations by content (for backward compatibility) or by ID
      entity.observations = entity.observations.filter(o => 
        !d.observations.includes(o.content) && !d.observations.includes(o.id)
      );
    }
  });
  await storage.saveGraph(graph);
}

/**
 * Update an existing observation by creating a new version with updated content.
 * This maintains the version history through the supersedes/superseded_by chain.
 * 
 * @param storage - Storage adapter
 * @param params - Update parameters
 * @param params.entityName - Name of the entity containing the observation
 * @param params.observationId - ID of the observation to update
 * @param params.newContent - New content for the observation
 * @param params.agentThreadId - Agent thread ID making this update
 * @param params.timestamp - ISO 8601 timestamp of the update
 * @param params.confidence - Optional confidence score (0-1), inherits from old observation if not provided
 * @param params.importance - Optional importance score (0-1), inherits from old observation if not provided
 * @returns The newly created observation with incremented version number
 * @throws Error if entity not found
 * @throws Error if observation not found
 * @throws Error if observation has already been superseded (must update latest version)
 */
export async function updateObservation(
  storage: IStorageAdapter,
  params: {
    entityName: string;
    observationId: string;
    newContent: string;
    agentThreadId: string;
    timestamp: string;
    confidence?: number;
    importance?: number;
  }
): Promise<Observation> {
  const graph = await storage.loadGraph();
  
  // Find and validate the entity and observation
  const entity = findEntity(graph, params.entityName);
  const oldObs = findObservation(entity, params.observationId);
  validateObservationNotSuperseded(oldObs);
  
  // Create new version with inheritance chain
  const newObs = createObservationVersion(oldObs, entity, params);
  
  // Link old observation to new one
  oldObs.superseded_by = newObs.id;
  
  // Add new observation to entity
  entity.observations.push(newObs);
  
  // Update entity timestamp
  entity.timestamp = params.timestamp;
  
  await storage.saveGraph(graph);
  return newObs;
}
