import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager } from '../lib/knowledge-graph-manager.js';
import {
  TEST_CONSTANTS,
  createTestEntity,
  createEntityWithMinimalObservation,
  createEntityWithSupersededObservation,
  createUpdateParams
} from './update-observation-helpers.js';

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
    // Arrange
    await manager.createEntities([createTestEntity()]);

    // Act
    const updatedObs = await manager.updateObservation(
      createUpdateParams({ confidence: TEST_CONSTANTS.HIGH_CONFIDENCE })
    );

    // Assert
    expect(updatedObs.content).toBe('Updated content');
    expect(updatedObs.version).toBe(2);
    expect(updatedObs.supersedes).toBe('obs-001');
    expect(updatedObs.confidence).toBe(TEST_CONSTANTS.HIGH_CONFIDENCE);
    expect(updatedObs.importance).toBe(TEST_CONSTANTS.DEFAULT_IMPORTANCE);

    // Verify the old observation is linked
    const graph = await manager.readGraph(TEST_CONSTANTS.THREAD_ID);
    const entity = graph.entities.find(e => e.name === TEST_CONSTANTS.ENTITY_NAME);
    expect(entity).toBeDefined();
    
    const oldObs = entity!.observations.find(o => o.id === 'obs-001');
    expect(oldObs).toBeDefined();
    expect(oldObs!.superseded_by).toBe(updatedObs.id);

    // Verify both observations are in the entity
    expect(entity!.observations).toHaveLength(2);
  });

  it('should inherit confidence and importance from old observation if not provided', async () => {
    // Arrange
    await manager.createEntities([
      createTestEntity({
        observations: [{
          id: 'obs-001',
          content: 'Original content',
          timestamp: TEST_CONSTANTS.INITIAL_TIMESTAMP,
          version: 1,
          agentThreadId: TEST_CONSTANTS.THREAD_ID,
          confidence: TEST_CONSTANTS.LOW_CONFIDENCE,
          importance: TEST_CONSTANTS.LOW_IMPORTANCE
        }]
      })
    ]);

    // Act - Update without providing confidence/importance
    const updatedObs = await manager.updateObservation(createUpdateParams());

    // Assert - Should inherit from old observation
    expect(updatedObs.confidence).toBe(TEST_CONSTANTS.LOW_CONFIDENCE);
    expect(updatedObs.importance).toBe(TEST_CONSTANTS.LOW_IMPORTANCE);
  });

  it('should inherit from entity if observation does not have confidence/importance', async () => {
    // Arrange - Observation without confidence/importance to test entity inheritance
    await manager.createEntities([createEntityWithMinimalObservation()]);

    // Act - Update without providing confidence/importance
    const updatedObs = await manager.updateObservation(createUpdateParams());

    // Assert - Should inherit from entity
    expect(updatedObs.confidence).toBe(TEST_CONSTANTS.DEFAULT_CONFIDENCE);
    expect(updatedObs.importance).toBe(TEST_CONSTANTS.DEFAULT_IMPORTANCE);
  });

  it('should throw error if entity not found', async () => {
    // Act & Assert
    await expect(
      manager.updateObservation(createUpdateParams({ entityName: 'NonExistent' }))
    ).rejects.toThrow("Entity 'NonExistent' not found");
  });

  it('should throw error if observation not found', async () => {
    // Arrange
    await manager.createEntities([createTestEntity()]);

    // Act & Assert
    await expect(
      manager.updateObservation(createUpdateParams({ observationId: 'non-existent' }))
    ).rejects.toThrow("Observation 'non-existent' not found in entity 'TestEntity'");
  });

  it('should throw error if observation already superseded', async () => {
    // Arrange
    await manager.createEntities([createEntityWithSupersededObservation()]);

    // Act & Assert
    await expect(
      manager.updateObservation(
        createUpdateParams({
          newContent: 'Another update',
          timestamp: TEST_CONSTANTS.SECOND_UPDATE_TIMESTAMP
        })
      )
    ).rejects.toThrow("Observation 'obs-001' has already been superseded by 'obs-002'. Update the latest version instead.");
  });

  it('should create a valid version chain', async () => {
    // Arrange
    await manager.createEntities([
      createTestEntity({
        observations: [{
          id: 'obs-v1',
          content: 'Version 1',
          timestamp: TEST_CONSTANTS.INITIAL_TIMESTAMP,
          version: 1,
          agentThreadId: TEST_CONSTANTS.THREAD_ID
        }],
        confidence: 1.0,
        importance: 1.0
      })
    ]);

    // Act - Update to version 2
    const v2 = await manager.updateObservation(
      createUpdateParams({
        observationId: 'obs-v1',
        newContent: 'Version 2',
        timestamp: '2026-01-02T10:00:00Z'
      })
    );

    // Act - Update to version 3
    const v3 = await manager.updateObservation(
      createUpdateParams({
        observationId: v2.id,
        newContent: 'Version 3',
        timestamp: TEST_CONSTANTS.THIRD_UPDATE_TIMESTAMP
      })
    );

    // Assert - Verify the chain
    const graph = await manager.readGraph(TEST_CONSTANTS.THREAD_ID);
    const entity = graph.entities.find(e => e.name === TEST_CONSTANTS.ENTITY_NAME);
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
    const history = await manager.getObservationHistory(TEST_CONSTANTS.ENTITY_NAME, 'obs-v1', TEST_CONSTANTS.THREAD_ID);
    expect(history).toHaveLength(3);
    expect(history[0].content).toBe('Version 1');
    expect(history[1].content).toBe('Version 2');
    expect(history[2].content).toBe('Version 3');
  });

  it('should update entity timestamp', async () => {
    // Arrange
    await manager.createEntities([createTestEntity()]);

    // Act
    await manager.updateObservation(createUpdateParams());

    // Assert
    const graph = await manager.readGraph(TEST_CONSTANTS.THREAD_ID);
    const entity = graph.entities.find(e => e.name === TEST_CONSTANTS.ENTITY_NAME);
    expect(entity!.timestamp).toBe(TEST_CONSTANTS.UPDATE_TIMESTAMP);
  });
});
