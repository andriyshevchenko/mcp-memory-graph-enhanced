/**
 * Conflict detection service
 */

import { IStorageAdapter } from '../storage-interface.js';
import { hasNegation, NEGATION_WORDS } from '../utils/negation-detector.js';

/**
 * Detect conflicting observations within entities
 * Identifies potential contradictions by checking for negation patterns
 */
export async function detectConflicts(storage: IStorageAdapter): Promise<{
  entityName: string;
  conflicts: { obs1: string; obs2: string; reason: string }[];
}[]> {
  const graph = await storage.loadGraph();
  const conflicts: { entityName: string; conflicts: { obs1: string; obs2: string; reason: string }[] }[] = [];
  
  for (const entity of graph.entities) {
    const entityConflicts: { obs1: string; obs2: string; reason: string }[] = [];
    
    for (let i = 0; i < entity.observations.length; i++) {
      for (let j = i + 1; j < entity.observations.length; j++) {
        const obs1Content = entity.observations[i].content.toLowerCase();
        const obs2Content = entity.observations[j].content.toLowerCase();
        
        // Skip if observations are in the same version chain
        if (entity.observations[i].supersedes === entity.observations[j].id || 
            entity.observations[j].supersedes === entity.observations[i].id ||
            entity.observations[i].superseded_by === entity.observations[j].id ||
            entity.observations[j].superseded_by === entity.observations[i].id) {
          continue;
        }
        
        // Check for negation patterns
        const obs1HasNegation = hasNegation(obs1Content);
        const obs2HasNegation = hasNegation(obs2Content);
        
        // If one has negation and they share key words, might be a conflict
        if (obs1HasNegation !== obs2HasNegation) {
          const words1 = obs1Content.split(/\s+/).filter(w => w.length > 3);
          const words2Set = new Set(obs2Content.split(/\s+/).filter(w => w.length > 3));
          const commonWords = words1.filter(w => words2Set.has(w) && !NEGATION_WORDS.has(w));
          
          if (commonWords.length >= 2) {
            entityConflicts.push({
              obs1: entity.observations[i].content,
              obs2: entity.observations[j].content,
              reason: 'Potential contradiction with negation'
            });
          }
        }
      }
    }
    
    if (entityConflicts.length > 0) {
      conflicts.push({ entityName: entity.name, conflicts: entityConflicts });
    }
  }
  
  return conflicts;
}
