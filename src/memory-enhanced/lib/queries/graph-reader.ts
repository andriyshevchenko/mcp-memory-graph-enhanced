/**
 * Graph reading operations
 */

import { KnowledgeGraph } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';

/**
 * Read the entire knowledge graph
 */
export async function readGraph(storage: IStorageAdapter): Promise<KnowledgeGraph> {
  return storage.loadGraph();
}
