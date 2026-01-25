import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager } from '../lib/knowledge-graph-manager.js';
import { Entity } from '../lib/types.js';

describe('Observation Versioning - getObservationHistory', () => {
  let manager: KnowledgeGraphManager;
  let testDirPath: string;

  beforeEach(async () => {
    // Create a temporary test directory
    testDirPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      `test-obs-history-${Date.now()}`
    );
    await fs.mkdir(testDirPath, { recursive: true });
    manager = new KnowledgeGraphManager(testDirPath);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      const files = await fs.readdir(testDirPath);
      await Promise.all(files.map(f => fs.unlink(path.join(testDirPath, f))));
      await fs.rmdir(testDirPath);
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
  });

  it('should throw error for non-existent entity', async () => {
    await expect(
      manager.getObservationHistory('test-thread', 'NonExistent', 'obs-123')
    ).rejects.toThrow("Entity 'NonExistent' not found");
  });

  it('should throw error for non-existent observation', async () => {
    const entities: Entity[] = [
      {
        name: 'TestEntity',
        entityType: 'Test',
        observations: [{
          id: 'obs-123',
          content: 'Test observation',
          timestamp: '2026-01-01T10:00:00Z',
          version: 1,
          agentThreadId: 'test-thread'
        }],
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 1.0,
        importance: 1.0
      }
    ];

    await manager.createEntities('test-thread', entities);

    await expect(
      manager.getObservationHistory('test-thread', 'TestEntity', 'non-existent-obs')
    ).rejects.toThrow("Observation 'non-existent-obs' not found");
  });

  it('should handle observation with no version chain', async () => {
    const entities: Entity[] = [
      {
        name: 'TestEntity',
        entityType: 'Test',
        observations: [{
          id: 'obs-standalone',
          content: 'Standalone observation',
          timestamp: '2026-01-01T10:00:00Z',
          version: 1,
          agentThreadId: 'test-thread'
        }],
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 1.0,
        importance: 1.0
      }
    ];

    await manager.createEntities('test-thread', entities);

    const history = await manager.getObservationHistory('test-thread', 'TestEntity', 'obs-standalone');

    expect(history).toHaveLength(1);
    expect(history[0].content).toBe('Standalone observation');
    expect(history[0].version).toBe(1);
  });

  it('should traverse version chain forwards (superseded_by)', async () => {
    const entities: Entity[] = [
      {
        name: 'TestEntity',
        entityType: 'Test',
        observations: [
          {
            id: 'obs-v1',
            content: 'Version 1',
            timestamp: '2026-01-01T10:00:00Z',
            version: 1,
            superseded_by: 'obs-v2',
            agentThreadId: 'test-thread'
          },
          {
            id: 'obs-v2',
            content: 'Version 2',
            timestamp: '2026-01-02T10:00:00Z',
            version: 2,
            supersedes: 'obs-v1',
            superseded_by: 'obs-v3',
            agentThreadId: 'test-thread'
          },
          {
            id: 'obs-v3',
            content: 'Version 3',
            timestamp: '2026-01-03T10:00:00Z',
            version: 3,
            supersedes: 'obs-v2',
            agentThreadId: 'test-thread'
          }
        ],
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 1.0,
        importance: 1.0
      }
    ];

    await manager.createEntities('test-thread', entities);

    // Start from v1 and get full history
    const history = await manager.getObservationHistory('test-thread', 'TestEntity', 'obs-v1');

    expect(history).toHaveLength(3);
    expect(history[0].id).toBe('obs-v1');
    expect(history[1].id).toBe('obs-v2');
    expect(history[2].id).toBe('obs-v3');
  });

  it('should traverse version chain backwards (supersedes)', async () => {
    const entities: Entity[] = [
      {
        name: 'TestEntity',
        entityType: 'Test',
        observations: [
          {
            id: 'obs-v1',
            content: 'Version 1',
            timestamp: '2026-01-01T10:00:00Z',
            version: 1,
            superseded_by: 'obs-v2',
            agentThreadId: 'test-thread'
          },
          {
            id: 'obs-v2',
            content: 'Version 2',
            timestamp: '2026-01-02T10:00:00Z',
            version: 2,
            supersedes: 'obs-v1',
            superseded_by: 'obs-v3',
            agentThreadId: 'test-thread'
          },
          {
            id: 'obs-v3',
            content: 'Version 3',
            timestamp: '2026-01-03T10:00:00Z',
            version: 3,
            supersedes: 'obs-v2',
            agentThreadId: 'test-thread'
          }
        ],
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 1.0,
        importance: 1.0
      }
    ];

    await manager.createEntities('test-thread', entities);

    // Start from v3 and get full history
    const history = await manager.getObservationHistory('test-thread', 'TestEntity', 'obs-v3');

    expect(history).toHaveLength(3);
    expect(history[0].id).toBe('obs-v1');
    expect(history[1].id).toBe('obs-v2');
    expect(history[2].id).toBe('obs-v3');
  });

  it('should handle mid-chain starting point', async () => {
    const entities: Entity[] = [
      {
        name: 'TestEntity',
        entityType: 'Test',
        observations: [
          {
            id: 'obs-v1',
            content: 'Version 1',
            timestamp: '2026-01-01T10:00:00Z',
            version: 1,
            superseded_by: 'obs-v2',
            agentThreadId: 'test-thread'
          },
          {
            id: 'obs-v2',
            content: 'Version 2',
            timestamp: '2026-01-02T10:00:00Z',
            version: 2,
            supersedes: 'obs-v1',
            superseded_by: 'obs-v3',
            agentThreadId: 'test-thread'
          },
          {
            id: 'obs-v3',
            content: 'Version 3',
            timestamp: '2026-01-03T10:00:00Z',
            version: 3,
            supersedes: 'obs-v2',
            agentThreadId: 'test-thread'
          }
        ],
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 1.0,
        importance: 1.0
      }
    ];

    await manager.createEntities('test-thread', entities);

    // Start from v2 and get full history
    const history = await manager.getObservationHistory('test-thread', 'TestEntity', 'obs-v2');

    expect(history).toHaveLength(3);
    expect(history[0].id).toBe('obs-v1');
    expect(history[1].id).toBe('obs-v2');
    expect(history[2].id).toBe('obs-v3');
  });

  it('should return observations in version chain order', async () => {
    const entities: Entity[] = [
      {
        name: 'TestEntity',
        entityType: 'Test',
        observations: [
          {
            id: 'obs-v1',
            content: 'Version 1',
            timestamp: '2026-01-01T10:00:00Z',
            version: 1,
            superseded_by: 'obs-v2',
            agentThreadId: 'test-thread'
          },
          {
            id: 'obs-v2',
            content: 'Version 2',
            timestamp: '2026-01-01T11:00:00Z',
            version: 2,
            supersedes: 'obs-v1',
            agentThreadId: 'test-thread'
          }
        ],
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 1.0,
        importance: 1.0
      }
    ];

    await manager.createEntities('test-thread', entities);

    const history = await manager.getObservationHistory('test-thread', 'TestEntity', 'obs-v1');

    // Should be in version chain order (v1 -> v2)
    expect(history[0].id).toBe('obs-v1');
    expect(history[1].id).toBe('obs-v2');
    expect(history[0].version).toBe(1);
    expect(history[1].version).toBe(2);
  });

  it('should include all observation fields in history', async () => {
    const entities: Entity[] = [
      {
        name: 'TestEntity',
        entityType: 'Test',
        observations: [{
          id: 'obs-full',
          content: 'Test observation',
          timestamp: '2026-01-01T10:00:00Z',
          version: 1,
          agentThreadId: 'test-thread',
          confidence: 0.95,
          importance: 0.8
        }],
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 1.0,
        importance: 1.0
      }
    ];

    await manager.createEntities('test-thread', entities);

    const history = await manager.getObservationHistory('test-thread', 'TestEntity', 'obs-full');

    expect(history[0]).toHaveProperty('id');
    expect(history[0]).toHaveProperty('content');
    expect(history[0]).toHaveProperty('timestamp');
    expect(history[0]).toHaveProperty('version');
    expect(history[0]).toHaveProperty('agentThreadId');
    expect(history[0].content).toBe('Test observation');
    expect(history[0].version).toBe(1);
  });
});
