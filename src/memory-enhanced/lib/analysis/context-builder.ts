/**
 * Context builder service
 */

import { KnowledgeGraph } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';

/**
 * Get context (entities related to specified entities up to a certain depth)
 * Expands to include related entities up to specified depth
 */
export async function getContext(
  storage: IStorageAdapter,
  entityNames: string[],
  depth: number = 1
): Promise<KnowledgeGraph> {
  const graph = await storage.loadGraph();
  const contextEntityNames = new Set<string>(entityNames);
  
  // Expand to include related entities up to specified depth
  for (let d = 0; d < depth; d++) {
    const currentEntities = Array.from(contextEntityNames);
    for (const entityName of currentEntities) {
      // Find all relations involving this entity
      const relatedRelations = graph.relations.filter(r => 
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
  const contextEntities = graph.entities.filter(e => contextEntityNames.has(e.name));
  const contextRelations = graph.relations.filter(r => 
    contextEntityNames.has(r.from) && contextEntityNames.has(r.to)
  );
  
  return {
    entities: contextEntities,
    relations: contextRelations
  };
}
