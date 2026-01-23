/**
 * Quality score calculator
 */

import { SaveMemoryEntity } from '../types.js';
import { 
  MAX_OBSERVATION_LENGTH,
  TARGET_AVG_RELATIONS,
  RELATION_SCORE_WEIGHT,
  OBSERVATION_SCORE_WEIGHT
} from '../constants.js';

/**
 * Calculates quality score based on graph completeness
 * Score is based on:
 * - Average relations per entity (more is better)
 * - Atomic observations (shorter is better)
 */
export function calculateQualityScore(entities: SaveMemoryEntity[]): number {
  if (entities.length === 0) return 0;
  
  // Average relations per entity
  const avgRelations = entities.reduce((sum, e) => sum + e.relations.length, 0) / entities.length;
  const relationScore = Math.min(avgRelations / TARGET_AVG_RELATIONS, 1.0); // Normalize to 0-1
  
  // Average observation length (shorter is better for atomicity)
  const totalObs = entities.reduce((sum, e) => sum + e.observations.length, 0);
  if (totalObs === 0) {
    // No observations available; base score solely on relations to avoid division by zero
    return relationScore * RELATION_SCORE_WEIGHT;
  }
  const avgObsLength = entities.reduce((sum, e) => 
    sum + e.observations.reduce((s, o) => s + o.length, 0), 0
  ) / totalObs;
  const obsScore = 1 - (avgObsLength / MAX_OBSERVATION_LENGTH); // Shorter = higher score
  
  // Weighted average: relations matter more than observation length
  return relationScore * RELATION_SCORE_WEIGHT + obsScore * OBSERVATION_SCORE_WEIGHT;
}
