import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager } from '../index.js';
import { validateSaveMemoryRequest } from '../lib/validation.js';
import { SaveMemoryEntity } from '../lib/types.js';

describe('Validate Memory Tool', () => {
  let manager: KnowledgeGraphManager;
  let testDirPath: string;

  beforeEach(async () => {
    testDirPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      `test-validate-memory-${Date.now()}`
    );
    await fs.mkdir(testDirPath, { recursive: true });
    manager = new KnowledgeGraphManager(testDirPath);
  });

  afterEach(async () => {
    try {
      const files = await fs.readdir(testDirPath);
      await Promise.all(files.map(f => fs.unlink(path.join(testDirPath, f))));
      await fs.rmdir(testDirPath);
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
  });

  describe('Pre-validation without saving', () => {
    it('should validate valid entities without saving', async () => {
      const entities: SaveMemoryEntity[] = [
        {
          name: 'ValidEntity',
          entityType: 'Service',
          observations: ['This is a valid observation'],
          relations: [{ targetEntity: 'ValidEntity', relationType: 'self-reference' }]
        }
      ];

      const result = validateSaveMemoryRequest(entities);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);

      // Verify no entities were actually saved
      const graph = await manager.readGraph();
      expect(graph.entities.length).toBe(0);
    });

    it('should detect observation too long', async () => {
      const entities: SaveMemoryEntity[] = [
        {
          name: 'InvalidEntity',
          entityType: 'Service',
          observations: ['a'.repeat(301)], // Too long
          relations: [{ targetEntity: 'InvalidEntity', relationType: 'self-reference' }]
        }
      ];

      const result = validateSaveMemoryRequest(entities);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('too long');
      expect(result.errors[0].entityIndex).toBe(0);
      expect(result.errors[0].entity).toBe('InvalidEntity');
    });

    it('should detect missing relations', async () => {
      const entities: SaveMemoryEntity[] = [
        {
          name: 'NoRelations',
          entityType: 'Service',
          observations: ['Valid observation'],
          relations: [] // No relations - invalid
        }
      ];

      const result = validateSaveMemoryRequest(entities);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('must have at least 1 relation');
    });

    it('should detect non-existent relation targets', async () => {
      const entities: SaveMemoryEntity[] = [
        {
          name: 'Entity1',
          entityType: 'Service',
          observations: ['Valid observation'],
          relations: [{ targetEntity: 'NonExistent', relationType: 'depends on' }]
        }
      ];

      const result = validateSaveMemoryRequest(entities);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('not found');
    });

    it('should validate multiple entities and report all errors', async () => {
      const entities: SaveMemoryEntity[] = [
        {
          name: 'Entity1',
          entityType: 'Service',
          observations: ['a'.repeat(301)], // Too long
          relations: [{ targetEntity: 'Entity2', relationType: 'depends on' }]
        },
        {
          name: 'Entity2',
          entityType: 'Service',
          observations: ['Valid'],
          relations: [] // No relations
        }
      ];

      const result = validateSaveMemoryRequest(entities);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      
      // Should have errors for both entities
      const entity1Errors = result.errors.filter(e => e.entityIndex === 0);
      const entity2Errors = result.errors.filter(e => e.entityIndex === 1);
      
      expect(entity1Errors.length).toBeGreaterThan(0);
      expect(entity2Errors.length).toBeGreaterThan(0);
    });

    it('should validate cross-thread entity references', async () => {
      // First create an entity
      const existingEntity = {
        name: 'ExistingEntity',
        entityType: 'Service',
        observations: [{ 
          id: 'obs1', 
          content: 'Existing', 
          timestamp: '2024-01-01T00:00:00Z', 
          version: 1,
          agentThreadId: 'thread-1',
          confidence: 1,
          importance: 0.8
        }],
        agentThreadId: 'thread-1',
        timestamp: '2024-01-01T00:00:00Z',
        confidence: 1.0,
        importance: 0.8
      };
      
      await manager.createEntities('thread-1', [existingEntity]);

      // Get existing entity names
      const existingNames = await manager.getEntityNamesInThread('thread-1');

      // Validate new entity that references existing one
      const entities: SaveMemoryEntity[] = [
        {
          name: 'NewEntity',
          entityType: 'Service',
          observations: ['References existing entity'],
          relations: [{ targetEntity: 'ExistingEntity', relationType: 'depends on' }]
        }
      ];

      const result = validateSaveMemoryRequest(entities, existingNames);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect too many sentences', async () => {
      const entities: SaveMemoryEntity[] = [
        {
          name: 'TooManySentences',
          entityType: 'Service',
          observations: ['First sentence. Second sentence. Third sentence. Fourth sentence.'],
          relations: [{ targetEntity: 'TooManySentences', relationType: 'self-reference' }]
        }
      ];

      const result = validateSaveMemoryRequest(entities);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('Too many sentences');
    });

    it('should accept technical content with URLs', async () => {
      const entities: SaveMemoryEntity[] = [
        {
          name: 'TechnicalEntity',
          entityType: 'Service',
          observations: ['URL: https://api.example.com/v1/endpoint handles authentication'],
          relations: [{ targetEntity: 'TechnicalEntity', relationType: 'self-reference' }]
        }
      ];

      const result = validateSaveMemoryRequest(entities);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should provide entity index for debugging', async () => {
      const entities: SaveMemoryEntity[] = [
        {
          name: 'Valid1',
          entityType: 'Service',
          observations: ['Valid'],
          relations: [{ targetEntity: 'Valid1', relationType: 'self-reference' }]
        },
        {
          name: 'Invalid2',
          entityType: 'Service',
          observations: ['x'.repeat(301)],
          relations: [{ targetEntity: 'Invalid2', relationType: 'self-reference' }]
        },
        {
          name: 'Valid3',
          entityType: 'Service',
          observations: ['Valid'],
          relations: [{ targetEntity: 'Valid3', relationType: 'self-reference' }]
        }
      ];

      const result = validateSaveMemoryRequest(entities);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // Error should be for entity at index 1
      expect(result.errors[0].entityIndex).toBe(1);
      expect(result.errors[0].entity).toBe('Invalid2');
    });
  });
});
