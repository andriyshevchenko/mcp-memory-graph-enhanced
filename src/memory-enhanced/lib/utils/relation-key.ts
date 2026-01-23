/**
 * Utility for creating composite keys for relation deduplication
 */

import { Relation } from '../types.js';

/**
 * Create a composite key for relation deduplication.
 * 
 * We explicitly normalize the components to primitive strings to ensure
 * stable serialization and to document the assumption that `from`, `to`,
 * and `relationType` are simple string identifiers.
 */
export function createRelationKey(relation: Relation): string {
  const from = String(relation.from);
  const to = String(relation.to);
  const relationType = String(relation.relationType);
  
  return JSON.stringify([from, to, relationType]);
}
