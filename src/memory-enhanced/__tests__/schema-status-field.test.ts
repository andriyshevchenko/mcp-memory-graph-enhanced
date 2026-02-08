/**
 * Test suite for verifying status field is read-only (not client-writable)
 */

import { describe, it, expect } from 'vitest';
import { 
  CreateEntitiesInputSchema, 
  CreateRelationsInputSchema,
  DeleteRelationsInputSchema 
} from '../lib/schemas.js';

describe('Status field schema validation', () => {
  it('should reject entities with status field in create_entities input', () => {
    const inputWithStatus = {
      threadId: 'test-thread',
      entities: [
        {
          name: 'Test Entity',
          entityType: 'Test',
          observations: [
            {
              id: 'obs-1',
              content: 'Test observation',
              timestamp: '2024-01-01T00:00:00Z',
              version: 1,
              agentThreadId: 'test-thread'
            }
          ],
          agentThreadId: 'test-thread',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.5,
          status: 'ARCHIVED' // This should be rejected
        }
      ]
    };

    const result = CreateEntitiesInputSchema.safeParse(inputWithStatus);
    expect(result.success).toBe(false);
    // Schema validation succeeded in rejecting the input
  });

  it('should accept entities without status field in create_entities input', () => {
    const inputWithoutStatus = {
      threadId: 'test-thread',
      entities: [
        {
          name: 'Test Entity',
          entityType: 'Test',
          observations: [
            {
              id: 'obs-1',
              content: 'Test observation',
              timestamp: '2024-01-01T00:00:00Z',
              version: 1,
              agentThreadId: 'test-thread'
            }
          ],
          agentThreadId: 'test-thread',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.5
        }
      ]
    };

    const result = CreateEntitiesInputSchema.safeParse(inputWithoutStatus);
    expect(result.success).toBe(true);
  });

  it('should reject relations with status field in create_relations input', () => {
    const inputWithStatus = {
      threadId: 'test-thread',
      relations: [
        {
          from: 'Entity A',
          to: 'Entity B',
          relationType: 'connects to',
          agentThreadId: 'test-thread',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.5,
          status: 'ARCHIVED' // This should be rejected
        }
      ]
    };

    const result = CreateRelationsInputSchema.safeParse(inputWithStatus);
    expect(result.success).toBe(false);
    // Schema validation succeeded in rejecting the input
  });

  it('should accept relations without status field in create_relations input', () => {
    const inputWithoutStatus = {
      threadId: 'test-thread',
      relations: [
        {
          from: 'Entity A',
          to: 'Entity B',
          relationType: 'connects to',
          agentThreadId: 'test-thread',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.5
        }
      ]
    };

    const result = CreateRelationsInputSchema.safeParse(inputWithoutStatus);
    expect(result.success).toBe(true);
  });

  it('should reject relations with status field in delete_relations input', () => {
    const inputWithStatus = {
      threadId: 'test-thread',
      relations: [
        {
          from: 'Entity A',
          to: 'Entity B',
          relationType: 'connects to',
          agentThreadId: 'test-thread',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.5,
          status: 'ARCHIVED' // This should be rejected
        }
      ]
    };

    const result = DeleteRelationsInputSchema.safeParse(inputWithStatus);
    expect(result.success).toBe(false);
    // Schema validation succeeded in rejecting the input
  });

  it('should reject observations with status field in entity observations', () => {
    const inputWithStatus = {
      threadId: 'test-thread',
      entities: [
        {
          name: 'Test Entity',
          entityType: 'Test',
          observations: [
            {
              id: 'obs-1',
              content: 'Test observation',
              timestamp: '2024-01-01T00:00:00Z',
              version: 1,
              agentThreadId: 'test-thread',
              status: 'ARCHIVED' // This should be rejected
            }
          ],
          agentThreadId: 'test-thread',
          timestamp: '2024-01-01T00:00:00Z',
          confidence: 1.0,
          importance: 0.5
        }
      ]
    };

    const result = CreateEntitiesInputSchema.safeParse(inputWithStatus);
    expect(result.success).toBe(false);
    // Schema validation succeeded in rejecting the input
  });
});
