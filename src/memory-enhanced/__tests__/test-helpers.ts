/**
 * Shared test helpers and utilities following DRY principle
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager } from '../lib/knowledge-graph-manager.js';
import { Entity, Relation, Observation } from '../lib/types.js';

/**
 * Test directory manager - centralizes cleanup logic
 */
export class TestDirectoryManager {
  private testDirPath: string;

  constructor(prefix: string) {
    this.testDirPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      `${prefix}-${Date.now()}`
    );
  }

  async setup(): Promise<string> {
    await fs.mkdir(this.testDirPath, { recursive: true });
    return this.testDirPath;
  }

  async cleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.testDirPath);
      await Promise.all(files.map(f => fs.unlink(path.join(this.testDirPath, f))));
      await fs.rmdir(this.testDirPath);
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
  }

  getPath(): string {
    return this.testDirPath;
  }
}

/**
 * Builder for creating test observations - follows Builder pattern
 */
export class ObservationBuilder {
  private observation: Observation;

  constructor(id: string, content: string) {
    this.observation = {
      id,
      content,
      timestamp: '2026-01-01T10:00:00Z',
      version: 1,
      agentThreadId: 'test-thread',
      confidence: 1.0,
      importance: 0.5
    };
  }

  withTimestamp(timestamp: string): this {
    this.observation.timestamp = timestamp;
    return this;
  }

  withVersion(version: number): this {
    this.observation.version = version;
    return this;
  }

  withSupersedes(supersedes: string): this {
    this.observation.supersedes = supersedes;
    return this;
  }

  withSupersededBy(superseded_by: string): this {
    this.observation.superseded_by = superseded_by;
    return this;
  }

  withThreadId(threadId: string): this {
    this.observation.agentThreadId = threadId;
    return this;
  }

  build(): Observation {
    return { ...this.observation };
  }
}

/**
 * Builder for creating test entities - follows Builder pattern
 */
export class EntityBuilder {
  private entity: Entity;

  constructor(name: string, entityType: string) {
    this.entity = {
      name,
      entityType,
      observations: [],
      agentThreadId: 'test-thread',
      timestamp: '2026-01-01T10:00:00Z',
      confidence: 1.0,
      importance: 1.0
    };
  }

  withObservation(observation: Observation): this {
    this.entity.observations.push(observation);
    return this;
  }

  withObservations(observations: Observation[]): this {
    this.entity.observations = [...observations];
    return this;
  }

  withTimestamp(timestamp: string): this {
    this.entity.timestamp = timestamp;
    return this;
  }

  withThreadId(threadId: string): this {
    this.entity.agentThreadId = threadId;
    return this;
  }

  withImportance(importance: number): this {
    this.entity.importance = importance;
    return this;
  }

  withConfidence(confidence: number): this {
    this.entity.confidence = confidence;
    return this;
  }

  build(): Entity {
    return { ...this.entity, observations: [...this.entity.observations] };
  }
}

/**
 * Builder for creating test relations - follows Builder pattern
 */
export class RelationBuilder {
  private relation: Relation;

  constructor(from: string, to: string, relationType: string) {
    this.relation = {
      from,
      to,
      relationType,
      agentThreadId: 'test-thread',
      timestamp: '2026-01-01T10:00:00Z',
      confidence: 1.0,
      importance: 1.0
    };
  }

  withTimestamp(timestamp: string): this {
    this.relation.timestamp = timestamp;
    return this;
  }

  withThreadId(threadId: string): this {
    this.relation.agentThreadId = threadId;
    return this;
  }

  withImportance(importance: number): this {
    this.relation.importance = importance;
    return this;
  }

  withConfidence(confidence: number): this {
    this.relation.confidence = confidence;
    return this;
  }

  build(): Relation {
    return { ...this.relation };
  }
}

/**
 * Factory for creating test manager instances - follows Factory pattern
 */
export async function createTestManager(prefix: string): Promise<{
  manager: KnowledgeGraphManager;
  dirManager: TestDirectoryManager;
}> {
  const dirManager = new TestDirectoryManager(prefix);
  const dirPath = await dirManager.setup();
  const manager = new KnowledgeGraphManager(dirPath);
  
  return { manager, dirManager };
}
