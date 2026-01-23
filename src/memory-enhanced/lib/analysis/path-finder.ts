/**
 * Path finding service for the knowledge graph
 */

import { Relation } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';

/**
 * Find the shortest path between two entities in the knowledge graph
 * Uses BFS algorithm with bidirectional search
 */
export async function findRelationPath(
  storage: IStorageAdapter,
  from: string,
  to: string,
  maxDepth: number = 5
): Promise<{
  found: boolean;
  path: string[];
  relations: Relation[];
}> {
  const graph = await storage.loadGraph();
  
  if (from === to) {
    return { found: true, path: [from], relations: [] };
  }
  
  // Build indexes for efficient relation lookup
  const relationsFrom = new Map<string, Relation[]>();
  const relationsTo = new Map<string, Relation[]>();
  for (const rel of graph.relations) {
    if (!relationsFrom.has(rel.from)) {
      relationsFrom.set(rel.from, []);
    }
    relationsFrom.get(rel.from)!.push(rel);
    
    if (!relationsTo.has(rel.to)) {
      relationsTo.set(rel.to, []);
    }
    relationsTo.get(rel.to)!.push(rel);
  }
  
  // BFS to find shortest path
  const queue: { entity: string; path: string[]; relations: Relation[] }[] = [
    { entity: from, path: [from], relations: [] }
  ];
  const visited = new Set<string>([from]);
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    if (current.path.length > maxDepth) {
      continue;
    }
    
    // Find all relations connected to current entity (both outgoing and incoming for bidirectional search)
    const outgoing = relationsFrom.get(current.entity) || [];
    const incoming = relationsTo.get(current.entity) || [];
    
    // Check outgoing relations
    for (const rel of outgoing) {
      if (rel.to === to) {
        return {
          found: true,
          path: [...current.path, rel.to],
          relations: [...current.relations, rel]
        };
      }
      
      if (!visited.has(rel.to)) {
        visited.add(rel.to);
        queue.push({
          entity: rel.to,
          path: [...current.path, rel.to],
          relations: [...current.relations, rel]
        });
      }
    }
    
    // Check incoming relations (traverse backwards)
    for (const rel of incoming) {
      if (rel.from === to) {
        return {
          found: true,
          path: [...current.path, rel.from],
          relations: [...current.relations, rel]
        };
      }
      
      if (!visited.has(rel.from)) {
        visited.add(rel.from);
        queue.push({
          entity: rel.from,
          path: [...current.path, rel.from],
          relations: [...current.relations, rel]
        });
      }
    }
  }
  
  return { found: false, path: [], relations: [] };
}
