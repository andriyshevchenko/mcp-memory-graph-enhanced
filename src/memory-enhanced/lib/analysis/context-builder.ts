/**
 * Context builder service
 */

import { KnowledgeGraph } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';

/**
 * Get context (entities related to specified entities up to a certain depth)
 * Expands to include related entities up to specified depth
 * Filtered to specific thread
 */
export async function getContext(
  storage: IStorageAdapter,
  entityNames: string[],
  depth: number,
  threadId: string
): Promise<KnowledgeGraph> {
  const graph = await storage.loadGraph();
  
  // Filter entities and relations to specific thread
  const threadEntities = graph.entities.filter(e => e.agentThreadId === threadId);
  const threadRelations = graph.relations.filter(r => r.agentThreadId === threadId);
  
  const contextEntityNames = new Set<string>(entityNames);
  
  // Expand to include related entities up to specified depth
  for (let d = 0; d < depth; d++) {
    const currentEntities = Array.from(contextEntityNames);
    for (const entityName of currentEntities) {
      // Find all relations involving this entity (from thread)
      const relatedRelations = threadRelations.filter(r => 
        r.from === entityName || r.to === entityName
      );
      
      // Add related entities
      relatedRelations.forEach(r => {
        contextEntityNames.add(r.from);
        contextEntityNames.add(r.to);
      });
    }
  }
  
  // Get all entities and relations in context
  const contextEntities = threadEntities.filter(e => contextEntityNames.has(e.name));
  const contextRelations = threadRelations.filter(r => 
    contextEntityNames.has(r.from) && contextEntityNames.has(r.to)
  );
  
  return {
    entities: contextEntities,
    relations: contextRelations
  };
}
