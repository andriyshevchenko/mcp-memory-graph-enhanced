/**
 * Entity CRUD operations
 */

import { Entity } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';

/**
 * Create new entities in the knowledge graph
 * Entity names are globally unique across all threads in the collaborative knowledge graph
 * This prevents duplicate entities while allowing multiple threads to contribute to the same entity
 */
export async function createEntities(
  storage: IStorageAdapter,
  entities: Entity[]
): Promise<Entity[]> {
  const graph = await storage.loadGraph();
  const existingNames = new Set(graph.entities.map(e => e.name));
  const newEntities = entities.filter(e => !existingNames.has(e.name));
  graph.entities.push(...newEntities);
  await storage.saveGraph(graph);
  return newEntities;
}

/**
 * Delete entities from the knowledge graph
 * Also removes all relations referencing the deleted entities
 */
export async function deleteEntities(
  storage: IStorageAdapter,
  entityNames: string[]
): Promise<void> {
  const graph = await storage.loadGraph();
  const namesToDelete = new Set(entityNames);
  graph.entities = graph.entities.filter(e => !namesToDelete.has(e.name));
  graph.relations = graph.relations.filter(r => !namesToDelete.has(r.from) && !namesToDelete.has(r.to));
  await storage.saveGraph(graph);
}
