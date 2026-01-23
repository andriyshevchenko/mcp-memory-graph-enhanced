/**
 * Utilities for observation validation and version creation
 */

import { Entity, Observation } from '../types.js';
import { randomUUID } from 'crypto';

/**
 * Validate that an observation can be updated (not already superseded).
 * @param observation - The observation to validate
 * @throws Error if observation has already been superseded
 */
export function validateObservationNotSuperseded(observation: Observation): void {
  if (observation.superseded_by) {
    throw new Error(
      `Observation '${observation.id}' has already been superseded by '${observation.superseded_by}'. Update the latest version instead.`
    );
  }
}

/**
 * Resolve a numeric value using an inheritance chain: params > observation > entity.
 * @param providedValue - Value provided in parameters (optional)
 * @param observationValue - Value from observation (optional)
 * @param entityValue - Value from entity (fallback)
 * @returns Resolved value
 */
export function resolveInheritedValue(
  providedValue: number | undefined,
  observationValue: number | undefined,
  entityValue: number
): number {
  return providedValue ?? observationValue ?? entityValue;
}

/**
 * Create a new observation version from an existing observation.
 * @param oldObs - The observation being updated
 * @param entity - The entity containing the observation
 * @param params - Update parameters
 * @returns New observation with incremented version
 */
export function createObservationVersion(
  oldObs: Observation,
  entity: Entity,
  params: {
    newContent: string;
    agentThreadId: string;
    timestamp: string;
    confidence?: number;
    importance?: number;
  }
): Observation {
  return {
    id: `obs_${randomUUID()}`,
    content: params.newContent,
    timestamp: params.timestamp,
    version: oldObs.version + 1,
    supersedes: oldObs.id,
    agentThreadId: params.agentThreadId,
    confidence: resolveInheritedValue(params.confidence, oldObs.confidence, entity.confidence),
    importance: resolveInheritedValue(params.importance, oldObs.importance, entity.importance)
  };
}
