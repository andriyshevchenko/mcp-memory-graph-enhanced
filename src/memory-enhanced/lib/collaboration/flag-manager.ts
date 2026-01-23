/**
 * Collaboration features (flagging, review)
 */

import { Entity, Observation } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';
import { randomUUID } from 'crypto';

/**
 * Flag an entity for review
 */
export async function flagForReview(
  storage: IStorageAdapter,
  entityName: string,
  reason: string,
  reviewer?: string
): Promise<void> {
  const graph = await storage.loadGraph();
  const entity = graph.entities.find(e => e.name === entityName);
  
  if (!entity) {
    throw new Error(`Entity with name ${entityName} not found`);
  }
  
  // Add a special observation to mark for review
  const flagContent = `[FLAGGED FOR REVIEW: ${reason}${reviewer ? ` - Reviewer: ${reviewer}` : ''}]`;
  
  // Check if this flag already exists (by content)
  if (!entity.observations.some(o => o.content === flagContent)) {
    const flagObservation: Observation = {
      id: `obs_${randomUUID()}`,
      content: flagContent,
      timestamp: new Date().toISOString(),
      version: 1,
      agentThreadId: entity.agentThreadId,
      confidence: 1.0, // Flag observations have full confidence
      importance: 1.0  // Flag observations are highly important
    };
    
    entity.observations.push(flagObservation);
    entity.timestamp = new Date().toISOString();
    await storage.saveGraph(graph);
  }
}

/**
 * Get all entities flagged for review
 */
export async function getFlaggedEntities(storage: IStorageAdapter): Promise<Entity[]> {
  const graph = await storage.loadGraph();
  return graph.entities.filter(e => 
    e.observations.some(obs => obs.content.includes('[FLAGGED FOR REVIEW:'))
  );
}
