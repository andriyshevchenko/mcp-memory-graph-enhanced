/**
 * Entity type validation and normalization
 */

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
    if (condensed.length > 0) {
      const suggested = condensed
        .split(' ')
        .map(word => word[0].toUpperCase() + word.slice(1))
        .join('');
      warnings.push(`EntityType '${entityType}' contains spaces. Consider using '${suggested}' instead.`);
    } else {
      // Handle the edge case where the entity type is only whitespace
      warnings.push(`EntityType '${entityType}' contains only whitespace and will be treated as empty.`);
    }
  }
  
  return { normalized, warnings };
}
