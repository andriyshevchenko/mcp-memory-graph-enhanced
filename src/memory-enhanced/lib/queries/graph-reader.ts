/**
 * Graph reading operations
 */

import { KnowledgeGraph } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';

/**
 * Read the knowledge graph for a specific thread
 */
export async function readGraph(storage: IStorageAdapter, threadId: string): Promise<KnowledgeGraph> {
  const fullGraph = await storage.loadGraph();
  
  // Filter entities and relations to only include those from the specified thread
  const filteredEntities = fullGraph.entities.filter(e => e.agentThreadId === threadId);
  const filteredRelations = fullGraph.relations.filter(r => r.agentThreadId === threadId);
  
  return {
    entities: filteredEntities,
    relations: filteredRelations
  };
}
