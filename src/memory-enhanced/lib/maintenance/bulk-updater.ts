/**
 * Bulk update service
 */

import { Observation } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';
import { randomUUID } from 'crypto';

/**
 * Perform bulk updates on multiple entities
 */
export async function bulkUpdate(
  storage: IStorageAdapter,
  updates: {
    entityName: string;
    confidence?: number;
    importance?: number;
    addObservations?: string[];
  }[]
): Promise<{ updated: number; notFound: string[] }> {
  const graph = await storage.loadGraph();
  let updated = 0;
  const notFound: string[] = [];
  
  for (const update of updates) {
    const entity = graph.entities.find(e => e.name === update.entityName);
    if (!entity) {
      notFound.push(update.entityName);
      continue;
    }
    
    if (update.confidence !== undefined) {
      entity.confidence = update.confidence;
    }
    if (update.importance !== undefined) {
      entity.importance = update.importance;
    }
    if (update.addObservations) {
      // Filter out observations that already exist (by content)
      const newObsContents = update.addObservations.filter(obsContent => 
        !entity.observations.some(o => o.content === obsContent)
      );
      
      // Create Observation objects for new observations
      const newObservations: Observation[] = newObsContents.map(content => ({
        id: `obs_${randomUUID()}`,
        content: content,
        timestamp: new Date().toISOString(),
        version: 1,
        agentThreadId: entity.agentThreadId, // Use entity's thread ID
        confidence: update.confidence ?? entity.confidence,
        importance: update.importance ?? entity.importance
      }));
      
      entity.observations.push(...newObservations);
    }
    
    entity.timestamp = new Date().toISOString();
    updated++;
  }
  
  await storage.saveGraph(graph);
  return { updated, notFound };
}
