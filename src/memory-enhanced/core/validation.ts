// Phase 1: Validation functions for save_memory
export function validateObservation(obs: string): { valid: boolean; error?: string } {
  const MAX_LENGTH = 150;
  const MAX_SENTENCES = 2;

  if (obs.length > MAX_LENGTH) {
    return {
      valid: false,
      error: `Observation too long (${obs.length} chars). Max ${MAX_LENGTH}. Split into multiple observations.`
    };
  }

  // Note: Simple sentence splitting - may count abbreviations (e.g., "Mr.", "U.S.A.") as sentence ends.
  // This is intentional per spec to keep validation simple and encourage truly atomic observations.
  // Better to occasionally reject valid content than to allow complex multi-fact observations.
  const sentences = obs.split(/[.!?]/).filter(s => s.trim().length > 0);
  if (sentences.length > MAX_SENTENCES) {
    return {
      valid: false,
      error: `Too many sentences (${sentences.length}). Max ${MAX_SENTENCES}. One fact per observation.`
    };
  }

  return { valid: true };
}

export function validateEntityType(entityType: string): { warnings: string[] } {
  const warnings: string[] = [];

  // Check if starts with lowercase
  if (entityType.length > 0 && entityType[0] === entityType[0].toLowerCase()) {
    warnings.push(`Entity type '${entityType}' starts with lowercase. Consider '${entityType[0].toUpperCase() + entityType.slice(1)}' (convention: capitalize first letter)`);
  }

  // Check for spaces
  if (entityType.includes(' ')) {
    warnings.push(`Entity type '${entityType}' contains spaces. Consider using camelCase or removing spaces.`);
  }

  return { warnings };
}
