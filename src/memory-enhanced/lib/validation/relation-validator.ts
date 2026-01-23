/**
 * Relation validation functions
 */

import { ValidationResult, SaveMemoryEntity } from '../types.js';

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
 * Validates that relation targets exist in the same request or in existing entities
 * @param entity The entity whose relations to validate
 * @param allEntityNames Set of entity names in the current request
 * @param existingEntityNames Optional set of entity names that already exist in storage (for cross-thread references)
 */
export function validateRelationTargets(
  entity: SaveMemoryEntity, 
  allEntityNames: Set<string>,
  existingEntityNames?: Set<string>
): ValidationResult {
  for (const relation of entity.relations) {
    const targetInCurrentBatch = allEntityNames.has(relation.targetEntity);
    const targetInExisting = existingEntityNames?.has(relation.targetEntity) ?? false;
    
    if (!targetInCurrentBatch && !targetInExisting) {
      return {
        valid: false,
        error: `Target entity '${relation.targetEntity}' not found in request or existing entities`,
        suggestion: `targetEntity must reference another entity in the same save_memory call or an existing entity`
      };
    }
  }
  
  return { valid: true };
}
