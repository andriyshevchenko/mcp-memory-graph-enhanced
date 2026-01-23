/**
 * Request-level validation orchestrator
 */

import { SaveMemoryEntity } from '../types.js';
import { validateObservation } from './observation-validator.js';
import { normalizeEntityType } from './entity-type-validator.js';
import { validateEntityRelations, validateRelationTargets } from './relation-validator.js';

/**
 * Maximum length for observation preview in error messages
 */
const OBSERVATION_PREVIEW_LENGTH = 50;

/**
 * Result of validating a save_memory request
 */
export interface SaveMemoryValidationResult {
  valid: boolean;
  errors: Array<{ 
    entity: string; 
    entityIndex: number;
    entityType: string;
    error: string; 
    suggestion?: string;
    observationPreview?: string; // First 50 chars of problematic observation
  }>;
  warnings: string[];
}

/**
 * Validate a single entity and collect errors
 * 
 * **IMPORTANT**: This function mutates the entity.entityType field to normalize it.
 * This is intentional for backward compatibility with existing behavior.
 * 
 * @param entity Entity to validate (will be mutated to normalize entityType)
 * @param entityIndex Index of the entity in the request
 * @param entityNames Set of all entity names in the request
 * @param existingEntityNames Optional set of existing entity names
 */
function validateEntity(
  entity: SaveMemoryEntity,
  entityIndex: number,
  entityNames: Set<string>,
  existingEntityNames?: Set<string>
): {
  errors: Array<{
    entity: string;
    entityIndex: number;
    entityType: string;
    error: string;
    suggestion?: string;
    observationPreview?: string;
  }>;
  warnings: string[];
} {
  const errors: Array<{
    entity: string;
    entityIndex: number;
    entityType: string;
    error: string;
    suggestion?: string;
    observationPreview?: string;
  }> = [];
  const warnings: string[] = [];

  // Validate entity type and collect warnings
  // Note: entityType is normalized in-place for consistency with existing behavior
  // The normalized value is used throughout the rest of validation and saving
  const { normalized, warnings: typeWarnings } = normalizeEntityType(entity.entityType);
  entity.entityType = normalized; // Apply normalization (intentional mutation for consistency)
  warnings.push(...typeWarnings);
  
  // Validate observations (note: observations are still strings in SaveMemoryEntity input)
  for (let i = 0; i < entity.observations.length; i++) {
    const obsResult = validateObservation(entity.observations[i]);
    if (!obsResult.valid) {
      errors.push({
        entity: entity.name,
        entityIndex: entityIndex,
        entityType: entity.entityType,
        error: `Observation ${i + 1}: ${obsResult.error}`,
        suggestion: obsResult.suggestion,
        observationPreview: entity.observations[i].substring(0, OBSERVATION_PREVIEW_LENGTH) + 
                           (entity.observations[i].length > OBSERVATION_PREVIEW_LENGTH ? '...' : '')
      });
    }
  }
  
  // Validate mandatory relations
  const relResult = validateEntityRelations(entity);
  if (!relResult.valid) {
    errors.push({
      entity: entity.name,
      entityIndex: entityIndex,
      entityType: entity.entityType,
      error: relResult.error || 'Invalid relations',
      suggestion: relResult.suggestion
    });
  }
  
  // Validate relation targets (now supports cross-thread references)
  const targetResult = validateRelationTargets(entity, entityNames, existingEntityNames);
  if (!targetResult.valid) {
    errors.push({
      entity: entity.name,
      entityIndex: entityIndex,
      entityType: entity.entityType,
      error: targetResult.error || 'Invalid relation target',
      suggestion: targetResult.suggestion
    });
  }

  return { errors, warnings };
}

/**
 * Validates all aspects of a save_memory request
 * @param entities The entities to validate
 * @param existingEntityNames Optional set of entity names that already exist in storage (for cross-thread references)
 */
export function validateSaveMemoryRequest(
  entities: SaveMemoryEntity[],
  existingEntityNames?: Set<string>
): SaveMemoryValidationResult {
  const errors: Array<{ 
    entity: string; 
    entityIndex: number;
    entityType: string;
    error: string; 
    suggestion?: string;
    observationPreview?: string;
  }> = [];
  const warnings: string[] = [];
  
  // Collect all entity names for relation validation
  const entityNames = new Set(entities.map(e => e.name));
  
  // Validate each entity
  for (let entityIndex = 0; entityIndex < entities.length; entityIndex++) {
    const result = validateEntity(entities[entityIndex], entityIndex, entityNames, existingEntityNames);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
