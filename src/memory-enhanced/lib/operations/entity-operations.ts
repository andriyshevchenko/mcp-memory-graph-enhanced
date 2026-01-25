/**
 * Entity CRUD operations
 */

import { Entity } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';

/**
 * Create new entities in the knowledge graph
 * Entity names are globally unique across all threads in the collaborative knowledge graph
 * This prevents duplicate entities while allowing multiple threads to contribute to the same entity
 * @param threadId - Thread ID passed for context (entities already have agentThreadId set)
 */
export async function createEntities(
  storage: IStorageAdapter,
  threadId: string,
  entities: Entity[]
): Promise<Entity[]> {
  const graph = await storage.loadGraph();
  const existingNames = new Set(graph.entities.map(e => e.name));
  // Filter out entities that already exist, entities are expected to have agentThreadId already set
  const newEntities = entities.filter(e => !existingNames.has(e.name));
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
  // Determine which entities will actually be deleted for this thread
  const deletedEntityNames = new Set(
    graph.entities
      .filter(e => namesToDelete.has(e.name) && e.agentThreadId === threadId)
      .map(e => e.name)
  );
  // Only delete entities that belong to the specified thread
  graph.entities = graph.entities.filter(e => !(deletedEntityNames.has(e.name) && e.agentThreadId === threadId));
  // Only delete relations that belong to the specified thread and reference actually deleted entities
  graph.relations = graph.relations.filter(
    r => !(r.agentThreadId === threadId && (deletedEntityNames.has(r.from) || deletedEntityNames.has(r.to)))
  );
  await storage.saveGraph(graph);
}
