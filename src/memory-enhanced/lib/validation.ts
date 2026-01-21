/**
 * Validation logic for save_memory tool (Section 1 of spec)
 */

import { ValidationResult, SaveMemoryEntity } from './types.js';
import { 
  MAX_OBSERVATION_LENGTH, 
  MIN_OBSERVATION_LENGTH,
  MAX_SENTENCES, 
  SENTENCE_TERMINATORS,
  TARGET_AVG_RELATIONS,
  RELATION_SCORE_WEIGHT,
  OBSERVATION_SCORE_WEIGHT
} from './constants.js';

/**
 * Validates a single observation according to spec requirements:
 * - Min 5 characters
 * - Max 150 characters
 * - Max 2 sentences (simple count by periods)
 */
export function validateObservation(obs: string): ValidationResult {
  if (obs.length < MIN_OBSERVATION_LENGTH) {
    return {
      valid: false,
      error: `Observation too short (${obs.length} chars). Min ${MIN_OBSERVATION_LENGTH}.`,
      suggestion: `Provide more meaningful content.`
    };
  }
  
  if (obs.length > MAX_OBSERVATION_LENGTH) {
    return {
      valid: false,
      error: `Observation too long (${obs.length} chars). Max ${MAX_OBSERVATION_LENGTH}.`,
      suggestion: `Split into multiple observations.`
    };
  }
  
  const sentences = obs.split(SENTENCE_TERMINATORS).filter(s => s.trim().length > 0);
  if (sentences.length > MAX_SENTENCES) {
    return {
      valid: false,
      error: `Too many sentences (${sentences.length}). Max ${MAX_SENTENCES}.`,
      suggestion: `One fact per observation. Split this into ${sentences.length} separate observations.`
    };
  }
  
  return { valid: true };
}

/**
 * Validates that an entity has at least 1 relation (mandatory per spec)
 */
export function validateEntityRelations(entity: SaveMemoryEntity): ValidationResult {
  if (!entity.relations || entity.relations.length === 0) {
    return {
      valid: false,
      error: `Entity '${entity.name}' must have at least 1 relation`,
      suggestion: `Add relations to show connections: e.g., { targetEntity: 'OtherEntity', relationType: 'related to' }`
    };
  }
  
  return { valid: true };
}

/**
 * Validates that relation targets exist in the same request
 */
export function validateRelationTargets(
  entity: SaveMemoryEntity, 
  allEntityNames: Set<string>
): ValidationResult {
  for (const relation of entity.relations) {
    if (!allEntityNames.has(relation.targetEntity)) {
      return {
        valid: false,
        error: `Target entity '${relation.targetEntity}' not found in request`,
        suggestion: `targetEntity must reference another entity in the same save_memory call`
      };
    }
  }
  
  return { valid: true };
}

/**
 * Normalizes entity type and returns warnings (not errors) for style issues
 */
export function normalizeEntityType(entityType: string): { normalized: string; warnings: string[] } {
  const warnings: string[] = [];
  let normalized = entityType;
  
  // Auto-capitalize first letter
  if (entityType.length > 0 && entityType[0] !== entityType[0].toUpperCase()) {
    normalized = entityType[0].toUpperCase() + entityType.slice(1);
    warnings.push(`EntityType '${entityType}' should start with capital letter. Normalized to '${normalized}'.`);
  }
  
  // Warn about spaces in type and handle multiple consecutive spaces
  if (/\s/.test(entityType)) {
    // Replace multiple spaces with single space and trim
    const condensed = entityType.replace(/\s+/g, ' ').trim();
    const suggested = condensed
      .split(' ')
      .map(word => word[0].toUpperCase() + word.slice(1))
      .join('');
    warnings.push(`EntityType '${entityType}' contains spaces. Consider using '${suggested}' instead.`);
  }
  
  return { normalized, warnings };
}

/**
 * Validates all aspects of a save_memory request
 */
export interface SaveMemoryValidationResult {
  valid: boolean;
  errors: Array<{ entity: string; error: string; suggestion?: string }>;
  warnings: string[];
}

export function validateSaveMemoryRequest(
  entities: SaveMemoryEntity[]
): SaveMemoryValidationResult {
  const errors: Array<{ entity: string; error: string; suggestion?: string }> = [];
  const warnings: string[] = [];
  
  // Collect all entity names for relation validation
  const entityNames = new Set(entities.map(e => e.name));
  
  for (const entity of entities) {
    // Validate entity type and collect warnings
    const { normalized, warnings: typeWarnings } = normalizeEntityType(entity.entityType);
    entity.entityType = normalized; // Apply normalization
    warnings.push(...typeWarnings);
    
    // Validate observations (note: observations are still strings in SaveMemoryEntity input)
    for (let i = 0; i < entity.observations.length; i++) {
      const obsResult = validateObservation(entity.observations[i]);
      if (!obsResult.valid) {
        errors.push({
          entity: entity.name,
          error: `Observation ${i + 1}: ${obsResult.error}`,
          suggestion: obsResult.suggestion
        });
      }
    }
    
    // Validate mandatory relations
    const relResult = validateEntityRelations(entity);
    if (!relResult.valid) {
      errors.push({
        entity: entity.name,
        error: relResult.error || 'Invalid relations',
        suggestion: relResult.suggestion
      });
    }
    
    // Validate relation targets
    const targetResult = validateRelationTargets(entity, entityNames);
    if (!targetResult.valid) {
      errors.push({
        entity: entity.name,
        error: targetResult.error || 'Invalid relation target',
        suggestion: targetResult.suggestion
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

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
  const avgObsLength = entities.reduce((sum, e) => 
    sum + e.observations.reduce((s, o) => s + o.length, 0), 0
  ) / totalObs;
  const obsScore = 1 - (avgObsLength / MAX_OBSERVATION_LENGTH); // Shorter = higher score
  
  // Weighted average: relations matter more than observation length
  return relationScore * RELATION_SCORE_WEIGHT + obsScore * OBSERVATION_SCORE_WEIGHT;
}
