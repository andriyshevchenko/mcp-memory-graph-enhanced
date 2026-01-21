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
          observations: ['a'.repeat(151)], // Too long
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
    expect(result.validation_errors![0]).toContain('too long');
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
    expect(result.validation_errors![0]).toContain('must have at least 1 relation');
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
      (relations) => manager.createRelations(relations)
    );

    expect(result.success).toBe(false);
    expect(result.validation_errors).toBeDefined();
    expect(result.validation_errors![0]).toContain('not found in request');
  });

  it('should apply default confidence and importance values', async () => {
    const input: SaveMemoryInput = {
      entities: [
        {
          name: 'Entity1',
          entityType: 'Test',
          observations: ['Test'],
          relations: [{ targetEntity: 'Entity2', relationType: 'relates to' }]
          // No confidence or importance specified
        },
        {
          name: 'Entity2',
          entityType: 'Test',
          observations: ['Test'],
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
    const graph = await manager.readGraph();
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
          observations: ['Test'],
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
          observations: ['Test'],
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
    const graph = await manager.readGraph();
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
    
    const graph = await manager.readGraph();
    
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
          observations: ['Test'],
          relations: [{ targetEntity: 'Entity2', relationType: 'knows' }]
        },
        {
          name: 'Entity2',
          entityType: 'API Key', // Spaces - should warn
          observations: ['Test'],
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
});
