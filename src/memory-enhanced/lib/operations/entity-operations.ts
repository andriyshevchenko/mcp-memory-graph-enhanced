/**
 * Entity CRUD operations
 */

import { Entity } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';

/**
 * Create new entities in the knowledge graph
 * Entity names are globally unique across all threads in the collaborative knowledge graph
 * This prevents duplicate entities while allowing multiple threads to contribute to the same entity
 * Thread isolation: Only creates entities that belong to the specified thread
 */
export async function createEntities(
  storage: IStorageAdapter,
  threadId: string,
  entities: Entity[]
): Promise<Entity[]> {
  const graph = await storage.loadGraph();
  const existingNames = new Set(graph.entities.map(e => e.name));
  const newEntities = entities.filter(e => !existingNames.has(e.name) && e.agentThreadId === threadId);
  graph.entities.push(...newEntities);
  await storage.saveGraph(graph);
  return newEntities;
}

/**
 * Delete entities from the knowledge graph
 * Also removes all relations referencing the deleted entities
 * Thread isolation: Only deletes entities that belong to the specified thread
 */
export async function deleteEntities(
  storage: IStorageAdapter,
  threadId: string,
  entityNames: string[]
): Promise<void> {
  const graph = await storage.loadGraph();
  const namesToDelete = new Set(entityNames);
  // Only delete entities that belong to the specified thread
  graph.entities = graph.entities.filter(e => !(namesToDelete.has(e.name) && e.agentThreadId === threadId));
  // Only delete relations that belong to the specified thread and reference deleted entities
  graph.relations = graph.relations.filter(r => !(r.agentThreadId === threadId && (namesToDelete.has(r.from) || namesToDelete.has(r.to))));
  await storage.saveGraph(graph);
}
