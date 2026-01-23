/**
 * Search and filter operations for the knowledge graph
 */

import { KnowledgeGraph } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';

/**
 * Search for nodes in the knowledge graph by query string
 * Searches entity names, types, and observation content
 */
export async function searchNodes(
  storage: IStorageAdapter,
  query: string
): Promise<KnowledgeGraph> {
  const graph = await storage.loadGraph();
  
  // Filter entities
  const filteredEntities = graph.entities.filter(e => 
    e.name.toLowerCase().includes(query.toLowerCase()) ||
    e.entityType.toLowerCase().includes(query.toLowerCase()) ||
    e.observations.some(o => o.content?.toLowerCase().includes(query.toLowerCase()))
  );

  // Create a Set of filtered entity names for quick lookup
  const filteredEntityNames = new Set(filteredEntities.map(e => e.name));

  // Filter relations to only include those between filtered entities
  const filteredRelations = graph.relations.filter(r => 
    filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
  );

  const filteredGraph: KnowledgeGraph = {
    entities: filteredEntities,
    relations: filteredRelations,
  };

  return filteredGraph;
}

/**
 * Open specific nodes by name
 * Returns a subgraph containing only the specified entities and relations between them
 */
export async function openNodes(
  storage: IStorageAdapter,
  names: string[]
): Promise<KnowledgeGraph> {
  const graph = await storage.loadGraph();
  
  // Filter entities
  const filteredEntities = graph.entities.filter(e => names.includes(e.name));

  // Create a Set of filtered entity names for quick lookup
  const filteredEntityNames = new Set(filteredEntities.map(e => e.name));

  // Filter relations to only include those between filtered entities
  const filteredRelations = graph.relations.filter(r => 
    filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
  );

  const filteredGraph: KnowledgeGraph = {
    entities: filteredEntities,
    relations: filteredRelations,
  };

  return filteredGraph;
}

/**
 * Query nodes with advanced filters
 * Supports filtering by timestamp range, confidence range, and importance range
 */
export async function queryNodes(
  storage: IStorageAdapter,
  filters?: {
    timestampStart?: string;
    timestampEnd?: string;
    confidenceMin?: number;
    confidenceMax?: number;
    importanceMin?: number;
    importanceMax?: number;
  }
): Promise<KnowledgeGraph> {
  const graph = await storage.loadGraph();
  
  // If no filters provided, return entire graph
  if (!filters) {
    return graph;
  }
  
  // Apply filters to entities
  const filteredEntities = graph.entities.filter(e => {
    // Timestamp range filter
    if (filters.timestampStart && e.timestamp < filters.timestampStart) return false;
    if (filters.timestampEnd && e.timestamp > filters.timestampEnd) return false;
    
    // Confidence range filter
    if (filters.confidenceMin !== undefined && e.confidence < filters.confidenceMin) return false;
    if (filters.confidenceMax !== undefined && e.confidence > filters.confidenceMax) return false;
    
    // Importance range filter
    if (filters.importanceMin !== undefined && e.importance < filters.importanceMin) return false;
    if (filters.importanceMax !== undefined && e.importance > filters.importanceMax) return false;
    
    return true;
  });

  // Create a Set of filtered entity names for quick lookup
  const filteredEntityNames = new Set(filteredEntities.map(e => e.name));

  // Apply filters to relations (and ensure they connect filtered entities)
  const filteredRelations = graph.relations.filter(r => {
    // Must connect filtered entities
    if (!filteredEntityNames.has(r.from) || !filteredEntityNames.has(r.to)) return false;
    
    // Timestamp range filter
    if (filters.timestampStart && r.timestamp < filters.timestampStart) return false;
    if (filters.timestampEnd && r.timestamp > filters.timestampEnd) return false;
    
    // Confidence range filter
    if (filters.confidenceMin !== undefined && r.confidence < filters.confidenceMin) return false;
    if (filters.confidenceMax !== undefined && r.confidence > filters.confidenceMax) return false;
    
    // Importance range filter
    if (filters.importanceMin !== undefined && r.importance < filters.importanceMin) return false;
    if (filters.importanceMax !== undefined && r.importance > filters.importanceMax) return false;
    
    return true;
  });

  return {
    entities: filteredEntities,
    relations: filteredRelations,
  };
}
