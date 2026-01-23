/**
 * Validation logic for save_memory tool (Section 1 of spec)
 * This file now acts as a facade to the refactored validation modules
 */

// Re-export all validation functions for backward compatibility
export { validateObservation } from './validation/observation-validator.js';
export { normalizeEntityType } from './validation/entity-type-validator.js';
export { validateEntityRelations, validateRelationTargets } from './validation/relation-validator.js';
export { calculateQualityScore } from './validation/quality-scorer.js';
export { validateSaveMemoryRequest } from './validation/request-validator.js';
export type { SaveMemoryValidationResult } from './validation/request-validator.js';
