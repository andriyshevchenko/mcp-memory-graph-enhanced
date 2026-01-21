/**
 * Constants for validation rules
 * Centralized to follow DRY principle and make maintenance easier
 */

/**
 * Maximum length for observations in characters
 * Per spec Section 2: Hard Limits on Observation Length
 */
export const MAX_OBSERVATION_LENGTH = 150;

/**
 * Maximum number of sentences allowed per observation
 * Per spec Section 2: Hard Limits on Observation Length
 * Increased to 3 to accommodate technical facts with version numbers and metrics
 */
export const MAX_SENTENCES = 3;

/**
 * Minimum observation length in characters
 */
export const MIN_OBSERVATION_LENGTH = 5;

/**
 * Minimum entity name length
 */
export const MIN_ENTITY_NAME_LENGTH = 1;

/**
 * Maximum entity name length
 */
export const MAX_ENTITY_NAME_LENGTH = 100;

/**
 * Minimum entity type length
 */
export const MIN_ENTITY_TYPE_LENGTH = 1;

/**
 * Maximum entity type length
 */
export const MAX_ENTITY_TYPE_LENGTH = 50;

/**
 * Target average relations per entity for quality scoring
 * Used to normalize relation count to 0-1 scale
 */
export const TARGET_AVG_RELATIONS = 2;

/**
 * Weight for relation score in quality calculation
 */
export const RELATION_SCORE_WEIGHT = 0.7;

/**
 * Weight for observation score in quality calculation
 */
export const OBSERVATION_SCORE_WEIGHT = 0.3;

/**
 * Maximum number of entities returned in analytics queries
 */
export const ANALYTICS_RESULT_LIMIT = 10;

/**
 * Sentence terminators used for counting sentences
 */
export const SENTENCE_TERMINATORS = /[.!?]/;
