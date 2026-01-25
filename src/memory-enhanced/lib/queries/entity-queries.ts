/**
 * Entity query operations
 */

import { IStorageAdapter } from '../storage-interface.js';

/**
 * Get names of all entities across all threads.
 * 
 * Note: This function is used for administrative purposes and returns entity names
 * from all threads. Entity names are NOT globally unique - different threads can
 * have entities with the same name. This function is primarily used by the manager's
 * getAllEntityNames() method.
 * 
 * For thread-isolated validation (e.g., in save_memory), use getEntityNamesInThread() instead.
 */
export async function getAllEntityNames(storage: IStorageAdapter): Promise<Set<string>> {
  const graph = await storage.loadGraph();
  const entityNames = new Set<string>();
  
  // Return all entity names from all threads
  for (const entity of graph.entities) {
    entityNames.add(entity.name);
  }
  
  return entityNames;
}

/**
 * Get names of entities in a specific thread for thread isolation.
 * This ensures entities can only reference other entities in the same thread.
 * 
 * @param storage Storage adapter
 * @param threadId The thread ID to filter by
 * @returns Set of entity names that exist in the thread
 */
export async function getEntityNamesInThread(
  storage: IStorageAdapter,
  threadId: string
): Promise<Set<string>> {
  const graph = await storage.loadGraph();
  const entityNames = new Set<string>();
  
  // Return only entities in the specified thread
  for (const entity of graph.entities) {
    if (entity.agentThreadId === threadId) {
      entityNames.add(entity.name);
    }
  }
  
  return entityNames;
}

/**
 * List entities with optional filtering by type and name pattern
 * Thread isolation enforced - threadId is required.
 * 
 * @param storage Storage adapter
 * @param threadId Thread ID to filter by (required for thread isolation)
 * @param entityType Optional entity type filter (exact match)
 * @param namePattern Optional name pattern filter (case-insensitive substring match)
 * @returns Array of entities with name and entityType
 */
export async function listEntities(
  storage: IStorageAdapter,
  threadId: string,
  entityType?: string,
  namePattern?: string
): Promise<Array<{ name: string; entityType: string }>> {
  const graph = await storage.loadGraph();
  
  // Filter by thread ID (required for thread isolation)
  let filteredEntities = graph.entities.filter(e => e.agentThreadId === threadId);
  
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
