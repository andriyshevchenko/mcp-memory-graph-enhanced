/**
 * Relation inverter module - handles bidirectional relation creation
 * Follows Single Responsibility Principle by extracting inverse logic
 */

/**
 * Map of known relation types to their inverses
 * Centralized for easy maintenance
 */
const INVERSE_RELATION_MAP: Record<string, string> = {
  'created': 'created by',
  'created by': 'created',
  'contains': 'contained in',
  'contained in': 'contains',
  'uses': 'used by',
  'used by': 'uses',
  'manages': 'managed by',
  'managed by': 'manages',
  'owns': 'owned by',
  'owned by': 'owns',
  'modifies': 'modified by',
  'modified by': 'modifies',
  'updates': 'updated by',
  'updated by': 'updates'
};

/**
 * Converts a relation type to its inverse for bidirectional relations
 * @param relationType - The relation type to invert
 * @returns The inverse relation type
 */
export function getInverseRelationType(relationType: string): string {
  const normalized = relationType.toLowerCase();
  
  // Return known inverse from map
  if (INVERSE_RELATION_MAP[normalized]) {
    return INVERSE_RELATION_MAP[normalized];
  }
  
  // Simple heuristic: if it ends with "by", remove it; otherwise add "(inverse)"
  if (normalized.endsWith(' by')) {
    return relationType.slice(0, -3).trim();
  }
  
  return `${relationType} (inverse)`;
}

/**
 * Checks if a relation type has a known inverse
 * @param relationType - The relation type to check
 * @returns true if the relation type has a known inverse mapping
 */
export function hasKnownInverse(relationType: string): boolean {
  return relationType.toLowerCase() in INVERSE_RELATION_MAP;
}

/**
 * Registers a custom inverse relation mapping
 * Allows extending the inverse map at runtime
 * @param relationType - The relation type
 * @param inverse - Its inverse
 */
export function registerInverseRelation(relationType: string, inverse: string): void {
  INVERSE_RELATION_MAP[relationType.toLowerCase()] = inverse;
  INVERSE_RELATION_MAP[inverse.toLowerCase()] = relationType;
}
