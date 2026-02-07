/**
 * Graph reading operations
 */

import { KnowledgeGraph, Entity, Relation, Observation } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';

/**
 * Read the knowledge graph filtered by threadId for thread isolation
 * and by minimum importance threshold
 */
export async function readGraph(
  storage: IStorageAdapter, 
  threadId: string,
  minImportance: number = 0.1
): Promise<KnowledgeGraph> {
  const graph = await storage.loadGraph();
  
  // Filter entities by threadId
  const threadEntities = graph.entities.filter(e => e.agentThreadId === threadId);
  
  // Filter entities by importance and add ARCHIVED status for low importance items
  const filteredEntities = threadEntities
    .filter(e => e.importance >= minImportance)
    .map(entity => {
      // Mark entity as ARCHIVED if importance is less than 0.1 but meets minImportance
      const entityWithStatus: Entity = {
        ...entity,
        observations: entity.observations.map(obs => {
          const obsImportance = obs.importance ?? entity.importance;
          if (obsImportance >= minImportance && obsImportance < 0.1) {
            return { ...obs, status: 'ARCHIVED' as const };
          }
          return obs;
        })
      };
      
      if (entity.importance >= minImportance && entity.importance < 0.1) {
        entityWithStatus.status = 'ARCHIVED';
      }
      
      return entityWithStatus;
    });
  
  // Create a Set of filtered entity names for quick lookup
  const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
  // Filter relations to only include those between filtered entities and from the same thread
  const threadRelations = graph.relations.filter(r => 
    r.agentThreadId === threadId &&
    filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
  );
  
  // Filter relations by importance and add ARCHIVED status for low importance items
  const filteredRelations = threadRelations
    .filter(r => r.importance >= minImportance)
    .map(relation => {
      // Mark relation as ARCHIVED if importance is less than 0.1 but meets minImportance
      if (relation.importance >= minImportance && relation.importance < 0.1) {
        return { ...relation, status: 'ARCHIVED' as const };
      }
      return relation;
    });
  
  return {
    entities: filteredEntities,
    relations: filteredRelations
  };
}
