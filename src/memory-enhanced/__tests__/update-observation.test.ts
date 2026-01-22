import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager } from '../lib/knowledge-graph-manager.js';
import { Entity } from '../lib/types.js';

describe('updateObservation', () => {
  let manager: KnowledgeGraphManager;
  let testDirPath: string;

  beforeEach(async () => {
    // Create a temporary test directory
    testDirPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      `test-update-obs-${Date.now()}`
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

  it('should update an observation and create a new version', async () => {
    // Create an entity with an observation
    const entities: Entity[] = [
      {
        name: 'TestEntity',
        entityType: 'Test',
        observations: [{
          id: 'obs-001',
          content: 'Original content',
          timestamp: '2026-01-01T10:00:00Z',
          version: 1,
          agentThreadId: 'test-thread',
          confidence: 0.9,
          importance: 0.8
        }],
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 0.9,
        importance: 0.8
      }
    ];

    await manager.createEntities(entities);

    // Update the observation
    const updatedObs = await manager.updateObservation({
      entityName: 'TestEntity',
      observationId: 'obs-001',
      newContent: 'Updated content',
      agentThreadId: 'test-thread',
      timestamp: '2026-01-01T11:00:00Z',
      confidence: 0.95
    });

    // Verify the new observation
    expect(updatedObs.content).toBe('Updated content');
    expect(updatedObs.version).toBe(2);
    expect(updatedObs.supersedes).toBe('obs-001');
    expect(updatedObs.confidence).toBe(0.95);
    expect(updatedObs.importance).toBe(0.8); // inherited from old observation

    // Verify the old observation is linked
    const graph = await manager.readGraph();
    const entity = graph.entities.find(e => e.name === 'TestEntity');
    expect(entity).toBeDefined();
    
    const oldObs = entity!.observations.find(o => o.id === 'obs-001');
    expect(oldObs).toBeDefined();
    expect(oldObs!.superseded_by).toBe(updatedObs.id);

    // Verify both observations are in the entity
    expect(entity!.observations).toHaveLength(2);
  });

  it('should inherit confidence and importance from old observation if not provided', async () => {
    const entities: Entity[] = [
      {
        name: 'TestEntity',
        entityType: 'Test',
        observations: [{
          id: 'obs-001',
          content: 'Original content',
          timestamp: '2026-01-01T10:00:00Z',
          version: 1,
          agentThreadId: 'test-thread',
          confidence: 0.85,
          importance: 0.75
        }],
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 0.9,
        importance: 0.8
      }
    ];

    await manager.createEntities(entities);

    // Update without providing confidence/importance
    const updatedObs = await manager.updateObservation({
      entityName: 'TestEntity',
      observationId: 'obs-001',
      newContent: 'Updated content',
      agentThreadId: 'test-thread',
      timestamp: '2026-01-01T11:00:00Z'
    });

    // Should inherit from old observation
    expect(updatedObs.confidence).toBe(0.85);
    expect(updatedObs.importance).toBe(0.75);
  });

  it('should inherit from entity if observation does not have confidence/importance', async () => {
    const entities: Entity[] = [
      {
        name: 'TestEntity',
        entityType: 'Test',
        observations: [{
          id: 'obs-001',
          content: 'Original content',
          timestamp: '2026-01-01T10:00:00Z',
          version: 1,
          agentThreadId: 'test-thread'
          // No confidence/importance set
        }],
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 0.9,
        importance: 0.8
      }
    ];

    await manager.createEntities(entities);

    // Update without providing confidence/importance
    const updatedObs = await manager.updateObservation({
      entityName: 'TestEntity',
      observationId: 'obs-001',
      newContent: 'Updated content',
      agentThreadId: 'test-thread',
      timestamp: '2026-01-01T11:00:00Z'
    });

    // Should inherit from entity
    expect(updatedObs.confidence).toBe(0.9);
    expect(updatedObs.importance).toBe(0.8);
  });

  it('should throw error if entity not found', async () => {
    await expect(
      manager.updateObservation({
        entityName: 'NonExistent',
        observationId: 'obs-001',
        newContent: 'Updated content',
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T11:00:00Z'
      })
    ).rejects.toThrow("Entity 'NonExistent' not found");
  });

  it('should throw error if observation not found', async () => {
    const entities: Entity[] = [
      {
        name: 'TestEntity',
        entityType: 'Test',
        observations: [{
          id: 'obs-001',
          content: 'Original content',
          timestamp: '2026-01-01T10:00:00Z',
          version: 1,
          agentThreadId: 'test-thread'
        }],
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 0.9,
        importance: 0.8
      }
    ];

    await manager.createEntities(entities);

    await expect(
      manager.updateObservation({
        entityName: 'TestEntity',
        observationId: 'non-existent',
        newContent: 'Updated content',
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T11:00:00Z'
      })
    ).rejects.toThrow("Observation 'non-existent' not found in entity 'TestEntity'");
  });

  it('should throw error if observation already superseded', async () => {
    const entities: Entity[] = [
      {
        name: 'TestEntity',
        entityType: 'Test',
        observations: [
          {
            id: 'obs-001',
            content: 'Original content',
            timestamp: '2026-01-01T10:00:00Z',
            version: 1,
            superseded_by: 'obs-002',
            agentThreadId: 'test-thread'
          },
          {
            id: 'obs-002',
            content: 'Updated content',
            timestamp: '2026-01-01T11:00:00Z',
            version: 2,
            supersedes: 'obs-001',
            agentThreadId: 'test-thread'
          }
        ],
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 0.9,
        importance: 0.8
      }
    ];

    await manager.createEntities(entities);

    await expect(
      manager.updateObservation({
        entityName: 'TestEntity',
        observationId: 'obs-001',
        newContent: 'Another update',
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T12:00:00Z'
      })
    ).rejects.toThrow("Observation 'obs-001' has already been superseded by 'obs-002'. Update the latest version instead.");
  });

  it('should create a valid version chain', async () => {
    const entities: Entity[] = [
      {
        name: 'TestEntity',
        entityType: 'Test',
        observations: [{
          id: 'obs-v1',
          content: 'Version 1',
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

    await manager.createEntities(entities);

    // Update to version 2
    const v2 = await manager.updateObservation({
      entityName: 'TestEntity',
      observationId: 'obs-v1',
      newContent: 'Version 2',
      agentThreadId: 'test-thread',
      timestamp: '2026-01-02T10:00:00Z'
    });

    // Update to version 3
    const v3 = await manager.updateObservation({
      entityName: 'TestEntity',
      observationId: v2.id,
      newContent: 'Version 3',
      agentThreadId: 'test-thread',
      timestamp: '2026-01-03T10:00:00Z'
    });

    // Verify the chain
    const graph = await manager.readGraph();
    const entity = graph.entities.find(e => e.name === 'TestEntity');
    expect(entity!.observations).toHaveLength(3);

    const obsV1 = entity!.observations.find(o => o.id === 'obs-v1');
    expect(obsV1!.superseded_by).toBe(v2.id);

    const obsV2 = entity!.observations.find(o => o.id === v2.id);
    expect(obsV2!.supersedes).toBe('obs-v1');
    expect(obsV2!.superseded_by).toBe(v3.id);

    const obsV3 = entity!.observations.find(o => o.id === v3.id);
    expect(obsV3!.supersedes).toBe(v2.id);
    expect(obsV3!.superseded_by).toBeUndefined();

    // Test getObservationHistory to ensure the chain works
    const history = await manager.getObservationHistory('TestEntity', 'obs-v1');
    expect(history).toHaveLength(3);
    expect(history[0].content).toBe('Version 1');
    expect(history[1].content).toBe('Version 2');
    expect(history[2].content).toBe('Version 3');
  });

  it('should update entity timestamp', async () => {
    const entities: Entity[] = [
      {
        name: 'TestEntity',
        entityType: 'Test',
        observations: [{
          id: 'obs-001',
          content: 'Original content',
          timestamp: '2026-01-01T10:00:00Z',
          version: 1,
          agentThreadId: 'test-thread'
        }],
        agentThreadId: 'test-thread',
        timestamp: '2026-01-01T10:00:00Z',
        confidence: 0.9,
        importance: 0.8
      }
    ];

    await manager.createEntities(entities);

    const updateTimestamp = '2026-01-01T11:00:00Z';
    await manager.updateObservation({
      entityName: 'TestEntity',
      observationId: 'obs-001',
      newContent: 'Updated content',
      agentThreadId: 'test-thread',
      timestamp: updateTimestamp
    });

    const graph = await manager.readGraph();
    const entity = graph.entities.find(e => e.name === 'TestEntity');
    expect(entity!.timestamp).toBe(updateTimestamp);
  });
});
