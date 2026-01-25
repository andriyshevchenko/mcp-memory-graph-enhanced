import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleSaveMemory } from '../lib/save-memory-handler.js';
import { SaveMemoryInput } from '../lib/types.js';
import { KnowledgeGraphManager } from '../lib/knowledge-graph-manager.js';

describe('Save Memory Handler - Integration Tests', () => {
  let manager: KnowledgeGraphManager;
  let testDirPath: string;

  beforeEach(async () => {
    // Create a temporary test directory
    testDirPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      `test-save-memory-${Date.now()}`
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

  it('should successfully save valid entities with relations', async () => {
    const input: SaveMemoryInput = {
      entities: [
        {
          name: 'Alice',
          entityType: 'Person',
          observations: ['Works at Google', 'Lives in SF'],
          relations: [{ targetEntity: 'Bob', relationType: 'knows' }]
        },
        {
          name: 'Bob',
          entityType: 'Person',
          observations: ['Works at Microsoft'],
          relations: [{ targetEntity: 'Alice', relationType: 'knows' }]
        }
      ],
      threadId: 'test-thread-001'
    };

    const result = await handleSaveMemory(
      input,
      (entities) => manager.createEntities(entities),
      (relations) => manager.createRelations(relations)
    );

    expect(result.success).toBe(true);
    expect(result.created.entities).toBe(2);
    expect(result.created.relations).toBeGreaterThan(0); // Includes bidirectional relations
    expect(result.quality_score).toBeGreaterThan(0);
    expect(result.warnings).toEqual(expect.any(Array));
  });

  it('should reject request with observation too long', async () => {
    const input: SaveMemoryInput = {
      entities: [
        {
          name: 'Test',
          entityType: 'Test',
          observations: ['a'.repeat(301)], // Too long
          relations: [{ targetEntity: 'Other', relationType: 'relates to' }]
        },
        {
          name: 'Other',
          entityType: 'Test',
          observations: ['Valid'],
          relations: [{ targetEntity: 'Test', relationType: 'relates to' }]
        }
      ],
      threadId: 'test-thread-002'
    };

    const result = await handleSaveMemory(
      input,
      (entities) => manager.createEntities(entities),
      (relations) => manager.createRelations(relations)
    );

    expect(result.success).toBe(false);
    expect(result.validation_errors).toBeDefined();
    expect(result.validation_errors!.length).toBeGreaterThan(0);
    
    // Check for structured error format
    const errors = result.validation_errors as any[];
    const errorText = JSON.stringify(errors);
    expect(errorText).toContain('too long');
  });

  it('should reject request with missing relations', async () => {
    const input: SaveMemoryInput = {
      entities: [
        {
          name: 'Isolated',
          entityType: 'Test',
          observations: ['This entity has no relations'],
          relations: [] // No relations - should fail
        }
      ],
      threadId: 'test-thread-003'
    };

    const result = await handleSaveMemory(
      input,
      (entities) => manager.createEntities(entities),
      (relations) => manager.createRelations(relations)
    );

    expect(result.success).toBe(false);
    expect(result.validation_errors).toBeDefined();
    
    const errors = result.validation_errors as any[];
    const errorText = JSON.stringify(errors);
    expect(errorText).toContain('must have at least 1 relation');
  });

  it('should reject request with non-existent relation target', async () => {
    const input: SaveMemoryInput = {
      entities: [
        {
          name: 'Entity1',
          entityType: 'Test',
          observations: ['Valid observation'],
          relations: [{ targetEntity: 'NonExistent', relationType: 'relates to' }]
        }
      ],
      threadId: 'test-thread-004'
    };

    const result = await handleSaveMemory(
      input,
      (entities) => manager.createEntities(entities),
      (relations) => manager.createRelations(relations),
      (threadId) => manager.getEntityNamesInThread(threadId)
    );

    expect(result.success).toBe(false);
    expect(result.validation_errors).toBeDefined();
    
    const errors = result.validation_errors as any[];
    const errorText = JSON.stringify(errors);
    expect(errorText).toContain('not found in request or existing entities');
  });

  it('should apply default confidence and importance values', async () => {
    const input: SaveMemoryInput = {
      entities: [
        {
          name: 'Entity1',
          entityType: 'Test',
          observations: ['Test observation'],
          relations: [{ targetEntity: 'Entity2', relationType: 'relates to' }]
          // No confidence or importance specified
        },
        {
          name: 'Entity2',
          entityType: 'Test',
          observations: ['Test observation'],
          relations: [{ targetEntity: 'Entity1', relationType: 'relates to' }]
        }
      ],
      threadId: 'test-thread-005'
    };

    const result = await handleSaveMemory(
      input,
      (entities) => manager.createEntities(entities),
      (relations) => manager.createRelations(relations)
    );

    expect(result.success).toBe(true);
    
    // Verify defaults were applied
    const graph = await manager.readGraph('test-thread-005');
    const entity = graph.entities.find(e => e.name === 'Entity1');
    expect(entity).toBeDefined();
    expect(entity!.confidence).toBe(1.0); // Default confidence
    expect(entity!.importance).toBe(0.5); // Default importance
  });

  it('should respect custom confidence and importance values', async () => {
    const input: SaveMemoryInput = {
      entities: [
        {
          name: 'Entity1',
          entityType: 'Test',
          observations: ['Test observation'],
          relations: [{ 
            targetEntity: 'Entity2', 
            relationType: 'relates to',
            importance: 0.9 
          }],
          confidence: 0.8,
          importance: 0.7
        },
        {
          name: 'Entity2',
          entityType: 'Test',
          observations: ['Test observation'],
          relations: [{ targetEntity: 'Entity1', relationType: 'relates to' }]
        }
      ],
      threadId: 'test-thread-006'
    };

    const result = await handleSaveMemory(
      input,
      (entities) => manager.createEntities(entities),
      (relations) => manager.createRelations(relations)
    );

    expect(result.success).toBe(true);
    
    // Verify custom values were applied
    const graph = await manager.readGraph('test-thread-006');
    const entity = graph.entities.find(e => e.name === 'Entity1');
    expect(entity).toBeDefined();
    expect(entity!.confidence).toBe(0.8);
    expect(entity!.importance).toBe(0.7);
  });

  it('should create bidirectional relations', async () => {
    const input: SaveMemoryInput = {
      entities: [
        {
          name: 'Parent',
          entityType: 'Document',
          observations: ['Contains child'],
          relations: [{ targetEntity: 'Child', relationType: 'contains' }]
        },
        {
          name: 'Child',
          entityType: 'Section',
          observations: ['Part of parent'],
          relations: [{ targetEntity: 'Parent', relationType: 'contained in' }]
        }
      ],
      threadId: 'test-thread-007'
    };

    const result = await handleSaveMemory(
      input,
      (entities) => manager.createEntities(entities),
      (relations) => manager.createRelations(relations)
    );

    expect(result.success).toBe(true);
    
    const graph = await manager.readGraph('test-thread-007');
    
    // Should have relations in both directions
    const parentToChild = graph.relations.some(r => 
      r.from === 'Parent' && r.to === 'Child' && r.relationType === 'contains'
    );
    const childToParent = graph.relations.some(r => 
      r.from === 'Child' && r.to === 'Parent'
    );
    
    expect(parentToChild).toBe(true);
    expect(childToParent).toBe(true);
  });

  it('should generate warnings for entity type normalization', async () => {
    const input: SaveMemoryInput = {
      entities: [
        {
          name: 'Entity1',
          entityType: 'person', // Lowercase - should warn
          observations: ['Test observation'],
          relations: [{ targetEntity: 'Entity2', relationType: 'knows' }]
        },
        {
          name: 'Entity2',
          entityType: 'API Key', // Spaces - should warn
          observations: ['Test observation'],
          relations: [{ targetEntity: 'Entity1', relationType: 'owned by' }]
        }
      ],
      threadId: 'test-thread-008'
    };

    const result = await handleSaveMemory(
      input,
      (entities) => manager.createEntities(entities),
      (relations) => manager.createRelations(relations)
    );

    expect(result.success).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('capital letter'))).toBe(true);
    expect(result.warnings.some(w => w.includes('spaces'))).toBe(true);
  });

  it('should calculate quality score based on graph structure', async () => {
    const lowQualityInput: SaveMemoryInput = {
      entities: [
        {
          name: 'Entity1',
          entityType: 'Test',
          observations: ['a'.repeat(150)], // Long observation
          relations: [{ targetEntity: 'Entity2', relationType: 'relates to' }] // Only 1 relation
        },
        {
          name: 'Entity2',
          entityType: 'Test',
          observations: ['a'.repeat(150)],
          relations: [{ targetEntity: 'Entity1', relationType: 'relates to' }]
        }
      ],
      threadId: 'test-thread-009'
    };

    const highQualityInput: SaveMemoryInput = {
      entities: [
        {
          name: 'Entity3',
          entityType: 'Test',
          observations: ['Short'], // Short observation
          relations: [ // Multiple relations
            { targetEntity: 'Entity4', relationType: 'relates to' },
            { targetEntity: 'Entity5', relationType: 'uses' }
          ]
        },
        {
          name: 'Entity4',
          entityType: 'Test',
          observations: ['Short'],
          relations: [
            { targetEntity: 'Entity3', relationType: 'relates to' },
            { targetEntity: 'Entity5', relationType: 'contains' }
          ]
        },
        {
          name: 'Entity5',
          entityType: 'Test',
          observations: ['Short'],
          relations: [
            { targetEntity: 'Entity3', relationType: 'used by' },
            { targetEntity: 'Entity4', relationType: 'contained in' }
          ]
        }
      ],
      threadId: 'test-thread-010'
    };

    const lowResult = await handleSaveMemory(
      lowQualityInput,
      (entities) => manager.createEntities(entities),
      (relations) => manager.createRelations(relations)
    );

    const highResult = await handleSaveMemory(
      highQualityInput,
      (entities) => manager.createEntities(entities),
      (relations) => manager.createRelations(relations)
    );

    expect(lowResult.success).toBe(true);
    expect(highResult.success).toBe(true);
    expect(highResult.quality_score).toBeGreaterThan(lowResult.quality_score);
  });

  it('should allow incremental building with cross-thread entity references', async () => {
    // First save: Create ServiceA
    const firstInput: SaveMemoryInput = {
      entities: [
        {
          name: 'ServiceA',
          entityType: 'Service',
          observations: ['Main API service'],
          relations: [{ targetEntity: 'ServiceA', relationType: 'self-reference' }] // Self-reference to satisfy relation requirement
        }
      ],
      threadId: 'test-thread-incremental'
    };

    const firstResult = await handleSaveMemory(
      firstInput,
      (entities) => manager.createEntities(entities),
      (relations) => manager.createRelations(relations),
      (threadId) => manager.getEntityNamesInThread(threadId)
    );

    expect(firstResult.success).toBe(true);
    expect(firstResult.created.entities).toBe(1);

    // Second save: Create ServiceB that references ServiceA (cross-thread reference)
    const secondInput: SaveMemoryInput = {
      entities: [
        {
          name: 'ServiceB',
          entityType: 'Service',
          observations: ['Depends on ServiceA'],
          relations: [{ targetEntity: 'ServiceA', relationType: 'depends on' }] // References entity from first save
        }
      ],
      threadId: 'test-thread-incremental'
    };

    const secondResult = await handleSaveMemory(
      secondInput,
      (entities) => manager.createEntities(entities),
      (relations) => manager.createRelations(relations),
      (threadId) => manager.getEntityNamesInThread(threadId)
    );

    expect(secondResult.success).toBe(true);
    expect(secondResult.created.entities).toBe(1);

    // Verify the graph contains both entities and their relation
    const graph = await manager.readGraph('test-thread-incremental');
    expect(graph.entities.some(e => e.name === 'ServiceA')).toBe(true);
    expect(graph.entities.some(e => e.name === 'ServiceB')).toBe(true);
    expect(graph.relations.some(r => 
      r.from === 'ServiceB' && r.to === 'ServiceA' && r.relationType === 'depends on'
    )).toBe(true);
  });

  it('should reject cross-thread reference to non-existent entity', async () => {
    const input: SaveMemoryInput = {
      entities: [
        {
          name: 'NewEntity',
          entityType: 'Test',
          observations: ['References non-existent entity'],
          relations: [{ targetEntity: 'DoesNotExist', relationType: 'relates to' }]
        }
      ],
      threadId: 'test-thread-nonexistent'
    };

    const result = await handleSaveMemory(
      input,
      (entities) => manager.createEntities(entities),
      (relations) => manager.createRelations(relations),
      (threadId) => manager.getEntityNamesInThread(threadId)
    );

    expect(result.success).toBe(false);
    expect(result.validation_errors).toBeDefined();
    
    const errors = result.validation_errors as any[];
    const errorText = JSON.stringify(errors);
    expect(errorText).toContain('not found in request or existing entities');
  });

  describe('Detailed Validation Error Messages', () => {
    it('should provide structured error messages with entity index and type', async () => {
      const input: SaveMemoryInput = {
        entities: [
          {
            name: 'ValidEntity',
            entityType: 'Test',
            observations: ['Valid observation'],
            relations: [{ targetEntity: 'InvalidEntity', relationType: 'relates to' }]
          },
          {
            name: 'InvalidEntity',
            entityType: 'Test',
            observations: ['a'.repeat(301)], // Too long
            relations: [] // No relations - invalid
          }
        ],
        threadId: 'test-thread-detailed-errors'
      };

      const result = await handleSaveMemory(
        input,
        (entities) => manager.createEntities(entities),
        (relations) => manager.createRelations(relations),
        (threadId) => manager.getEntityNamesInThread(threadId)
      );

      expect(result.success).toBe(false);
      expect(result.validation_errors).toBeDefined();
      expect(Array.isArray(result.validation_errors)).toBe(true);
      
      // Should have structured error format
      const errors = result.validation_errors as any[];
      expect(errors.length).toBeGreaterThan(0);
      
      // Check structure of first error
      const firstError = errors[0];
      expect(firstError).toHaveProperty('entity_index');
      expect(firstError).toHaveProperty('entity_name');
      expect(firstError).toHaveProperty('entity_type');
      expect(firstError).toHaveProperty('errors');
      expect(Array.isArray(firstError.errors)).toBe(true);
    });

    it('should include observation preview in error details', async () => {
      const longObservation = 'This is a very long observation that exceeds the maximum allowed length for observations in the system. It keeps going and going to make sure it is definitely over the 300 character limit that is now enforced for technical content. We need to add even more text here to reach that limit and demonstrate the preview feature working correctly.';
      const input: SaveMemoryInput = {
        entities: [
          {
            name: 'TestEntity',
            entityType: 'Service',
            observations: [longObservation],
            relations: [{ targetEntity: 'TestEntity', relationType: 'self-reference' }]
          }
        ],
        threadId: 'test-thread-obs-preview'
      };

      const result = await handleSaveMemory(
        input,
        (entities) => manager.createEntities(entities),
        (relations) => manager.createRelations(relations)
      );

      expect(result.success).toBe(false);
      const errors = result.validation_errors as any[];
      
      // Should include observation preview
      const errorWithObs = errors.find((e: any) => e.observations && e.observations.length > 0);
      expect(errorWithObs).toBeDefined();
      if (errorWithObs) {
        expect(errorWithObs.observations[0]).toContain('This is a very long observation');
        expect(errorWithObs.observations[0].length).toBeLessThanOrEqual(53); // 50 chars + "..."
      }
    });

    it('should collect multiple errors for the same entity', async () => {
      const input: SaveMemoryInput = {
        entities: [
          {
            name: 'MultiErrorEntity',
            entityType: 'Test',
            observations: ['a'.repeat(301), 'First. Second. Third. Fourth.'], // One too long, one too many sentences
            relations: [] // No relations - invalid
          }
        ],
        threadId: 'test-thread-multi-errors'
      };

      const result = await handleSaveMemory(
        input,
        (entities) => manager.createEntities(entities),
        (relations) => manager.createRelations(relations)
      );

      expect(result.success).toBe(false);
      const errors = result.validation_errors as any[];
      expect(errors.length).toBeGreaterThan(0);
      
      // Should have multiple errors for the same entity
      const entityError = errors.find((e: any) => e.entity_name === 'MultiErrorEntity');
      expect(entityError).toBeDefined();
      expect(entityError.errors.length).toBeGreaterThanOrEqual(3); // obs1 too long, obs2 too many sentences, no relations
    });

    it('should provide entity_index to help identify which entity failed', async () => {
      const input: SaveMemoryInput = {
        entities: [
          {
            name: 'Entity1',
            entityType: 'Test',
            observations: ['Valid'],
            relations: [{ targetEntity: 'Entity2', relationType: 'relates to' }]
          },
          {
            name: 'Entity2',
            entityType: 'Test',
            observations: ['x'.repeat(301)], // Invalid
            relations: [{ targetEntity: 'Entity1', relationType: 'relates to' }]
          },
          {
            name: 'Entity3',
            entityType: 'Test',
            observations: ['Valid'],
            relations: [{ targetEntity: 'Entity1', relationType: 'relates to' }]
          }
        ],
        threadId: 'test-thread-index'
      };

      const result = await handleSaveMemory(
        input,
        (entities) => manager.createEntities(entities),
        (relations) => manager.createRelations(relations)
      );

      expect(result.success).toBe(false);
      const errors = result.validation_errors as any[];
      
      // Find the error for Entity2
      const entity2Error = errors.find((e: any) => e.entity_name === 'Entity2');
      expect(entity2Error).toBeDefined();
      expect(entity2Error.entity_index).toBe(1); // Second entity (0-indexed)
    });
  });

  describe('Entity Names in Response', () => {
    it('should return entity names after successful save', async () => {
      const input: SaveMemoryInput = {
        entities: [
          {
            name: 'ServiceA',
            entityType: 'Service',
            observations: ['Handles authentication'],
            relations: [{ targetEntity: 'ServiceB', relationType: 'depends on' }]
          },
          {
            name: 'ServiceB',
            entityType: 'Service',
            observations: ['Manages user data'],
            relations: [{ targetEntity: 'ServiceA', relationType: 'supports' }]
          }
        ],
        threadId: 'test-thread-entity-names'
      };

      const result = await handleSaveMemory(
        input,
        (entities) => manager.createEntities(entities),
        (relations) => manager.createRelations(relations)
      );

      expect(result.success).toBe(true);
      expect(result.created.entity_names).toBeDefined();
      expect(result.created.entity_names).toHaveLength(2);
      expect(result.created.entity_names).toContain('ServiceA');
      expect(result.created.entity_names).toContain('ServiceB');
    });

    it('should not include entity names on validation failure', async () => {
      const input: SaveMemoryInput = {
        entities: [
          {
            name: 'InvalidEntity',
            entityType: 'Test',
            observations: ['a'.repeat(301)], // Too long
            relations: [{ targetEntity: 'Other', relationType: 'relates to' }]
          },
          {
            name: 'Other',
            entityType: 'Test',
            observations: ['Valid'],
            relations: [{ targetEntity: 'InvalidEntity', relationType: 'relates to' }]
          }
        ],
        threadId: 'test-thread-no-names'
      };

      const result = await handleSaveMemory(
        input,
        (entities) => manager.createEntities(entities),
        (relations) => manager.createRelations(relations)
      );

      expect(result.success).toBe(false);
      expect(result.created.entity_names).toBeUndefined();
    });
  });
});
