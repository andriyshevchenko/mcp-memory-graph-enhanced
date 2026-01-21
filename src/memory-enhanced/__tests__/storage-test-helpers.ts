/**
 * Test helpers for storage abstraction tests
 * Provides factory methods and utilities to reduce test code duplication
 */

import { Entity, Relation, Observation } from '../lib/types.js';

/**
 * Default test values
 */
export const DEFAULT_TEST_VALUES = {
  threadId: 'thread-001',
  timestamp: '2024-01-20T10:00:00Z',
  confidence: 0.9,
  importance: 0.8
} as const;

/**
 * Create a test observation with default values
 */
export function createTestObservation(
  overrides: Partial<Observation> = {}
): Observation {
  return {
    id: 'obs-1',
    content: 'test observation',
    timestamp: DEFAULT_TEST_VALUES.timestamp,
    version: 1,
    agentThreadId: DEFAULT_TEST_VALUES.threadId,
    confidence: DEFAULT_TEST_VALUES.confidence,
    importance: DEFAULT_TEST_VALUES.importance,
    ...overrides
  };
}

/**
 * Create a test entity with default values
 */
export function createTestEntity(
  name: string,
  overrides: Partial<Entity> = {}
): Entity {
  return {
    name,
    entityType: 'test',
    observations: [],
    agentThreadId: DEFAULT_TEST_VALUES.threadId,
    timestamp: DEFAULT_TEST_VALUES.timestamp,
    confidence: DEFAULT_TEST_VALUES.confidence,
    importance: DEFAULT_TEST_VALUES.importance,
    ...overrides
  };
}

/**
 * Create a test relation with default values
 */
export function createTestRelation(
  from: string,
  to: string,
  overrides: Partial<Relation> = {}
): Relation {
  return {
    from,
    to,
    relationType: 'knows',
    agentThreadId: DEFAULT_TEST_VALUES.threadId,
    timestamp: DEFAULT_TEST_VALUES.timestamp,
    confidence: DEFAULT_TEST_VALUES.confidence,
    importance: DEFAULT_TEST_VALUES.importance,
    ...overrides
  };
}

/**
 * Create a person entity (common test case)
 */
export function createPersonEntity(name: string): Entity {
  return createTestEntity(name, {
    entityType: 'person',
    observations: []
  });
}

/**
 * Create an entity with a single observation
 */
export function createEntityWithObservation(
  name: string,
  observationContent: string
): Entity {
  return createTestEntity(name, {
    observations: [createTestObservation({ content: observationContent })]
  });
}
