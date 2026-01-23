/**
 * Utility for detecting negation words in text content
 */

export const NEGATION_WORDS = new Set(['not', 'no', 'never', 'neither', 'none', 'doesn\'t', 'don\'t', 'isn\'t', 'aren\'t']);

/**
 * Check if content contains any negation words (using word boundary matching)
 * Handles punctuation and contractions, avoids creating intermediate Set for performance
 */
export function hasNegation(content: string): boolean {
  // Extract words using word boundary regex, preserving contractions (include apostrophes)
  const lowerContent = content.toLowerCase();
  const wordMatches = lowerContent.match(/\b[\w']+\b/g);
  
  if (!wordMatches) {
    return false;
  }
  
  // Check each word against negation words without creating intermediate Set
  for (const word of wordMatches) {
    if (NEGATION_WORDS.has(word)) {
      return true;
    }
  }
  return false;
}
