/**
 * Storage interface abstraction for the Knowledge Graph
 * This allows for different storage backends (JSONL, Neo4j, etc.)
 */

import { Entity, Relation, KnowledgeGraph } from './types.js';

/**
 * Interface for storage operations on the knowledge graph
 */
export interface IStorageAdapter {
  /**
   * Load the entire knowledge graph from storage
   * @returns Promise resolving to the complete knowledge graph
   */
  loadGraph(): Promise<KnowledgeGraph>;

  /**
   * Save the entire knowledge graph to storage
   * @param graph The knowledge graph to save
   */
  saveGraph(graph: KnowledgeGraph): Promise<void>;

  /**
   * Initialize the storage (create directories, connections, etc.)
   */
  initialize(): Promise<void>;
}
