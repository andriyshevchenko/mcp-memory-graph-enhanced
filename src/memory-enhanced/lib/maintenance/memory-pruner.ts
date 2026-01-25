/**
 * Memory pruning service
 */

import { IStorageAdapter } from '../storage-interface.js';

/**
 * Prune memory based on age and importance criteria
 * Thread isolation: Only prunes entities and relations in the specified thread
 */
export async function pruneMemory(
  storage: IStorageAdapter,
  threadId: string,
  options: {
    olderThan?: string;
    importanceLessThan?: number;
    keepMinEntities?: number;
  }
): Promise<{ removedEntities: number; removedRelations: number }> {
  const graph = await storage.loadGraph();
  
  // Filter to only entities in the specified thread
  const threadEntities = graph.entities.filter(e => e.agentThreadId === threadId);
  const initialEntityCount = threadEntities.length;
  
  // Count initial relations in the thread
  const threadEntityNames = new Set(threadEntities.map(e => e.name));
  const initialRelationCount = graph.relations.filter(r => 
    r.agentThreadId === threadId && threadEntityNames.has(r.from) && threadEntityNames.has(r.to)
  ).length;
  
  // Filter entities to remove within the thread
  let entitiesToKeep = threadEntities;
  
  if (options.olderThan) {
    const cutoffDate = new Date(options.olderThan);
    entitiesToKeep = entitiesToKeep.filter(e => new Date(e.timestamp) >= cutoffDate);
  }
  
  if (options.importanceLessThan !== undefined) {
    entitiesToKeep = entitiesToKeep.filter(e => e.importance >= options.importanceLessThan!);
  }
  
  // Ensure we keep minimum entities
  // If keepMinEntities is set and we need more entities, backfill from the original thread entities
  // sorted by importance and recency
  if (options.keepMinEntities && entitiesToKeep.length < options.keepMinEntities) {
    const minToKeep = options.keepMinEntities;
    const alreadyKeptNames = new Set(entitiesToKeep.map(e => e.name));

    // Candidates are entities from the thread that are not already kept
    const candidates = threadEntities
      .filter(e => !alreadyKeptNames.has(e.name))
      .sort((a, b) => {
        if (a.importance !== b.importance) return b.importance - a.importance;
        return b.timestamp.localeCompare(a.timestamp);
      });

    const needed = minToKeep - entitiesToKeep.length;
    const backfill = candidates.slice(0, Math.max(0, needed));
    entitiesToKeep = [...entitiesToKeep, ...backfill];
  }
  
  const keptEntityNames = new Set(entitiesToKeep.map(e => e.name));
  const removedEntityNames = new Set(threadEntityNames);
  keptEntityNames.forEach(name => removedEntityNames.delete(name));
  
  // Update the main graph: remove entities from this thread that should be pruned
  graph.entities = graph.entities.filter(e => 
    e.agentThreadId !== threadId || keptEntityNames.has(e.name)
  );
  
  // Remove relations from this thread that reference removed entities
  graph.relations = graph.relations.filter(r => 
    !(r.agentThreadId === threadId && (removedEntityNames.has(r.from) || removedEntityNames.has(r.to)))
  );
  
  await storage.saveGraph(graph);
  
  return {
    removedEntities: initialEntityCount - entitiesToKeep.length,
    removedRelations: initialRelationCount - graph.relations.filter(r => 
      r.agentThreadId === threadId && keptEntityNames.has(r.from) && keptEntityNames.has(r.to)
    ).length
  };
}
