/**
 * Context builder service
 */

import { KnowledgeGraph } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';

/**
 * Get context (entities related to specified entities up to a certain depth)
 * Expands to include related entities up to specified depth
 * Filtered by threadId for thread isolation
 */
export async function getContext(
  storage: IStorageAdapter,
  threadId: string,
  entityNames: string[],
  depth: number = 1
): Promise<KnowledgeGraph> {
  const graph = await storage.loadGraph();
  const contextEntityNames = new Set<string>(entityNames);
  
  // Expand to include related entities up to specified depth - only within this thread
  for (let d = 0; d < depth; d++) {
    const currentEntities = Array.from(contextEntityNames);
    for (const entityName of currentEntities) {
      // Find all relations involving this entity - only from this thread
      const relatedRelations = graph.relations.filter(r => 
        r.agentThreadId === threadId &&
        (r.from === entityName || r.to === entityName)
      );
      
      // Add related entities
      relatedRelations.forEach(r => {
        contextEntityNames.add(r.from);
        contextEntityNames.add(r.to);
      });
    }
  }
  
  // Get all entities and relations in context - only from this thread
  const contextEntities = graph.entities.filter(e => 
    e.agentThreadId === threadId && contextEntityNames.has(e.name)
  );
  const contextRelations = graph.relations.filter(r => 
    r.agentThreadId === threadId &&
    contextEntityNames.has(r.from) && contextEntityNames.has(r.to)
  );
  
  return {
    entities: contextEntities,
    relations: contextRelations
  };
}
