/**
 * Observation history and versioning service
 */

import { Observation } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';
import { findEntity, findObservation } from '../utils/entity-finder.js';

/**
 * Get full history chain for an observation
 * Traces backwards and forwards through the version chain
 * Filtered by threadId for thread isolation
 */
export async function getObservationHistory(
  storage: IStorageAdapter,
  threadId: string,
  entityName: string,
  observationId: string
): Promise<Observation[]> {
  const graph = await storage.loadGraph();
  
  // Find the entity - only in the specified thread
  const entity = graph.entities.find(e => e.name === entityName && e.agentThreadId === threadId);
  if (!entity) {
    throw new Error(`Entity '${entityName}' not found in thread '${threadId}'`);
  }
  
  // Find the starting observation
  const startObs = entity.observations.find(o => o.id === observationId);
  if (!startObs) {
    throw new Error(`Observation '${observationId}' not found in entity '${entityName}'`);
  }
  
  // Build the version chain
  const history: Observation[] = [];
  
  // Trace backwards to find all predecessors
  let currentObs: Observation | undefined = startObs;
  const visited = new Set<string>();
  
  while (currentObs) {
    if (visited.has(currentObs.id)) {
      // Circular reference protection
      break;
    }
    visited.add(currentObs.id);
    history.unshift(currentObs); // Add to beginning for chronological order
    
    // Find predecessor
    if (currentObs.supersedes) {
      currentObs = entity.observations.find(o => o.id === currentObs!.supersedes);
    } else {
      break;
    }
  }
  
  // Trace forwards to find all successors
  let forwardObs: Observation = startObs;
  visited.clear();
  
  while (forwardObs.superseded_by) {
    if (visited.has(forwardObs.superseded_by)) {
      // Circular reference protection
      break;
    }
    const successor = entity.observations.find(o => o.id === forwardObs.superseded_by);
    if (successor) {
      visited.add(successor.id);
      history.push(successor);
      forwardObs = successor;
    } else {
      break;
    }
  }
  
  return history;
}
