/**
 * Relation CRUD operations
 */

import { Relation } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';
import { createRelationKey } from '../utils/relation-key.js';

/**
 * Create new relations in the knowledge graph
 * Relations are globally unique by (from, to, relationType) across all threads
 * This enables multiple threads to collaboratively build the knowledge graph
 */
export async function createRelations(
  storage: IStorageAdapter,
  relations: Relation[]
): Promise<Relation[]> {
  const graph = await storage.loadGraph();
  
  // Validate that referenced entities exist
  const entityNames = new Set(graph.entities.map(e => e.name));
  const validRelations = relations.filter(r => {
    if (!entityNames.has(r.from) || !entityNames.has(r.to)) {
      console.warn(`Skipping relation ${r.from} -> ${r.to}: one or both entities do not exist`);
      return false;
    }
    return true;
  });
  
  const existingRelationKeys = new Set(
    graph.relations.map(r => createRelationKey(r))
  );
  // Create composite keys once per valid relation to avoid duplicate serialization
  const validRelationsWithKeys = validRelations.map(r => ({
    relation: r,
    key: createRelationKey(r)
  }));
  const newRelations = validRelationsWithKeys
    .filter(item => !existingRelationKeys.has(item.key))
    .map(item => item.relation);
  graph.relations.push(...newRelations);
  await storage.saveGraph(graph);
  return newRelations;
}

/**
 * Delete relations from the knowledge graph
 * Deletions affect all threads in the collaborative knowledge graph
 */
export async function deleteRelations(
  storage: IStorageAdapter,
  relations: Relation[]
): Promise<void> {
  const graph = await storage.loadGraph();
  // Delete relations globally across all threads by matching (from, to, relationType)
  graph.relations = graph.relations.filter(r => !relations.some(delRelation => 
    r.from === delRelation.from && 
    r.to === delRelation.to && 
    r.relationType === delRelation.relationType
  ));
  await storage.saveGraph(graph);
}
