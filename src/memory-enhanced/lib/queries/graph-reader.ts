/**
 * Graph reading operations
 */

import { KnowledgeGraph } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';

/**
 * Read the knowledge graph filtered by threadId for thread isolation
 */
export async function readGraph(storage: IStorageAdapter, threadId: string): Promise<KnowledgeGraph> {
  const graph = await storage.loadGraph();
  
  // Filter entities by threadId
  const filteredEntities = graph.entities.filter(e => e.agentThreadId === threadId);
  
  // Create a Set of filtered entity names for quick lookup
  const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
  // Filter relations to only include those between filtered entities and from the same thread
  const filteredRelations = graph.relations.filter(r => 
    r.agentThreadId === threadId &&
    filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
  );
  
  return {
    entities: filteredEntities,
    relations: filteredRelations
  };
}
