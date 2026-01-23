/**
 * Entity query operations
 */

import { IStorageAdapter } from '../storage-interface.js';

/**
 * Get names of all entities that can be referenced in relations.
 * @returns Set of entity names that exist in the graph.
 * 
 * Note: Returns ALL entities globally because entity names are globally unique across
 * all threads in the collaborative knowledge graph (by design - see createEntities).
 * This enables any thread to reference any existing entity, supporting incremental
 * building and cross-thread collaboration. Thread-specific filtering is not needed
 * since entity names cannot conflict across threads.
 */
export async function getAllEntityNames(storage: IStorageAdapter): Promise<Set<string>> {
  const graph = await storage.loadGraph();
  const entityNames = new Set<string>();
  
  // Return all entities in the graph that can be referenced
  // This allows incremental building: entities from previous save_memory calls
  // can be referenced in new calls, enabling cross-save entity relations
  for (const entity of graph.entities) {
    entityNames.add(entity.name);
  }
  
  return entityNames;
}

/**
 * @deprecated Use {@link getAllEntityNames} instead.
 * 
 * This method is kept for backward compatibility. It accepts a threadId parameter
 * for API consistency but does not use it for filtering; it returns the same
 * global set of entity names as {@link getAllEntityNames}.
 * 
 * @param storage Storage adapter
 * @param threadId The thread ID (accepted but not used)
 * @returns Set of entity names that exist in the graph
 */
export async function getEntityNamesInThread(
  storage: IStorageAdapter,
  threadId: string
): Promise<Set<string>> {
  return getAllEntityNames(storage);
}

/**
 * List entities with optional filtering by type and name pattern
 * @param storage Storage adapter
 * @param threadId Optional thread ID to filter by. If not provided, returns entities from all threads.
 * @param entityType Optional entity type filter (exact match)
 * @param namePattern Optional name pattern filter (case-insensitive substring match)
 * @returns Array of entities with name and entityType
 */
export async function listEntities(
  storage: IStorageAdapter,
  threadId?: string,
  entityType?: string,
  namePattern?: string
): Promise<Array<{ name: string; entityType: string }>> {
  const graph = await storage.loadGraph();
  
  let filteredEntities = graph.entities;
  
  // Filter by thread ID if specified (otherwise returns all threads)
  if (threadId) {
    filteredEntities = filteredEntities.filter(e => e.agentThreadId === threadId);
  }
  
  // Filter by entity type if specified
  if (entityType) {
    filteredEntities = filteredEntities.filter(e => e.entityType === entityType);
  }
  
  // Filter by name pattern if specified (case-insensitive)
  if (namePattern) {
    const pattern = namePattern.toLowerCase();
    filteredEntities = filteredEntities.filter(e => 
      e.name.toLowerCase().includes(pattern)
    );
  }
  
  // Return simplified list with just name and entityType
  return filteredEntities.map(e => ({
    name: e.name,
    entityType: e.entityType
  }));
}
