/**
 * Observation validation functions
 */

import { ValidationResult } from '../types.js';
import { 
  MAX_OBSERVATION_LENGTH, 
  MIN_OBSERVATION_LENGTH,
  MAX_SENTENCES, 
  SENTENCE_TERMINATORS
} from '../constants.js';

/**
 * Counts actual sentences in text, ignoring periods in technical content
 * @param text The text to analyze
 * @returns Number of actual sentences
 */
function countSentences(text: string): number {
  // Patterns to ignore - technical content that contains periods but aren't sentence boundaries
  // NOTE: Order matters! More specific patterns (multi-letter abbreviations) must come before more general patterns
  const patternsToIgnore = [
    /https?:\/\/[^\s]+/g,                                                      // URLs (http:// or https://) - allows periods in paths
    /\b\d+\.\d+\.\d+\.\d+\b/g,                                                 // IP addresses (e.g., 192.168.1.1)
    /\b[A-Za-z]:[\\\/](?:[^\s<>:"|?*]+(?:\s+[^\s<>:"|?*]+)*)/g,               // Windows/Unix paths (handles spaces, e.g., C:\Program Files\...)
    /\b[vV]?\d+\.\d+(\.\d+)*\b/g,                                              // Version numbers (e.g., v1.2.0, 5.4.3)
    /\b(?:[A-Z]\.){2,}/g,                                                      // Multi-letter abbreviations (e.g., U.S., U.K., U.S.A., P.D.F., I.B.M., etc.) - must come before single-letter pattern
    /\b[A-Z][a-z]{0,3}\./g,                                                    // Common single-letter abbreviations (e.g., Dr., Mr., Mrs., Ms., Jr., Sr., etc.)
    /\b[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?){2,}\b/g,  // Hostnames/domains with at least 2 dots (e.g., sub.domain.com) - must come after all abbreviation patterns
  ];
  
  // Replace technical patterns with placeholders to prevent false sentence detection
  let cleaned = text;
  for (const pattern of patternsToIgnore) {
    cleaned = cleaned.replace(pattern, 'PLACEHOLDER');
  }
  
  // Split on actual sentence terminators and count non-empty sentences
  const sentences = cleaned.split(SENTENCE_TERMINATORS).filter(s => s.trim().length > 0);
  return sentences.length;
}

/**
 * Validates a single observation according to spec requirements:
 * - Min 5 characters
 * - Max 300 characters (increased to accommodate technical content)
 * - Max 3 sentences (ignoring periods in version numbers and decimals)
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
      suggestion: `Split into atomic facts.`
    };
  }
  
  const sentenceCount = countSentences(obs);
  if (sentenceCount > MAX_SENTENCES) {
    return {
      valid: false,
      error: `Too many sentences (${sentenceCount}). Max ${MAX_SENTENCES}.`,
      suggestion: `One fact per observation. Split this into ${sentenceCount} separate observations.`
    };
  }
  
  return { valid: true };
}
