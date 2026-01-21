import { describe, it, expect } from 'vitest';
import { 
  validateObservation, 
  validateEntityRelations, 
  validateRelationTargets,
  normalizeEntityType,
  validateSaveMemoryRequest,
  calculateQualityScore
} from '../lib/validation.js';
import { SaveMemoryEntity } from '../lib/types.js';

describe('Observation Validation', () => {
  it('should pass valid observations', () => {
    const result = validateObservation('This is a valid observation.');
    expect(result.valid).toBe(true);
  });

  it('should reject observations over 150 characters', () => {
    const longObs = 'a'.repeat(151);
    const result = validateObservation(longObs);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too long');
    expect(result.error).toContain('151 chars');
  });

  it('should reject observations with more than 3 sentences', () => {
    const result = validateObservation('First sentence. Second sentence. Third sentence. Fourth sentence.');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Too many sentences');
  });

  it('should accept observations with exactly 3 sentences', () => {
    const result = validateObservation('First sentence. Second sentence. Third sentence.');
    expect(result.valid).toBe(true);
  });

  it('should accept observations with exactly 2 sentences', () => {
    const result = validateObservation('First sentence. Second sentence.');
    expect(result.valid).toBe(true);
  });

  it('should accept observations at the 150 character limit', () => {
    const obs = 'a'.repeat(150);
    const result = validateObservation(obs);
    expect(result.valid).toBe(true);
  });

  it('should accept version numbers without counting periods as sentences', () => {
    const result = validateObservation('Library: python-docx version 1.2.0');
    expect(result.valid).toBe(true);
  });

  it('should accept observations with version numbers and additional info', () => {
    const result = validateObservation('Using pytest v5.4.3 for testing');
    expect(result.valid).toBe(true);
  });

  it('should accept observations with decimal numbers', () => {
    const result = validateObservation('API version 2.1.0 is stable');
    expect(result.valid).toBe(true);
  });

  it('should accept observations with numeric metrics', () => {
    const result1 = validateObservation('10 replaced with 21 numbers');
    expect(result1.valid).toBe(true);
    
    const result2 = validateObservation('26 rows deleted, 21 added');
    expect(result2.valid).toBe(true);
  });

  it('should accept observations with decimal numbers', () => {
    const result1 = validateObservation('Accuracy improved to 3.14 percent');
    expect(result1.valid).toBe(true);
    
    const result2 = validateObservation('Temperature is 98.6 degrees');
    expect(result2.valid).toBe(true);
    
    const result3 = validateObservation('PI is approximately 3.14159');
    expect(result3.valid).toBe(true);
  });

  it('should still correctly count actual sentences with version numbers', () => {
    const result = validateObservation('Version 1.0 released. Bug fixes applied. Documentation updated.');
    expect(result.valid).toBe(true); // 3 sentences, at the limit
  });

  it('should reject observations with too many actual sentences despite version numbers', () => {
    const result = validateObservation('Version 1.0 released. Bug fixes applied. Documentation updated. Tests passed.');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Too many sentences');
  });
});

describe('Entity Relations Validation', () => {
  it('should pass entities with at least one relation', () => {
    const entity: SaveMemoryEntity = {
      name: 'Test Entity',
      entityType: 'Test',
      observations: ['Test observation'],
      relations: [{ targetEntity: 'Other', relationType: 'relates to' }]
    };
    const result = validateEntityRelations(entity);
    expect(result.valid).toBe(true);
  });

  it('should reject entities with no relations', () => {
    const entity: SaveMemoryEntity = {
      name: 'Test Entity',
      entityType: 'Test',
      observations: ['Test observation'],
      relations: []
    };
    const result = validateEntityRelations(entity);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must have at least 1 relation');
  });
});

describe('Relation Target Validation', () => {
  it('should pass when all target entities exist', () => {
    const entity: SaveMemoryEntity = {
      name: 'Entity1',
      entityType: 'Test',
      observations: ['Test'],
      relations: [
        { targetEntity: 'Entity2', relationType: 'relates to' }
      ]
    };
    const entityNames = new Set(['Entity1', 'Entity2']);
    const result = validateRelationTargets(entity, entityNames);
    expect(result.valid).toBe(true);
  });

  it('should reject when target entity does not exist', () => {
    const entity: SaveMemoryEntity = {
      name: 'Entity1',
      entityType: 'Test',
      observations: ['Test'],
      relations: [
        { targetEntity: 'NonExistent', relationType: 'relates to' }
      ]
    };
    const entityNames = new Set(['Entity1', 'Entity2']);
    const result = validateRelationTargets(entity, entityNames);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not found in request');
  });
});

describe('Entity Type Normalization', () => {
  it('should capitalize first letter of entity type', () => {
    const result = normalizeEntityType('person');
    expect(result.normalized).toBe('Person');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('should start with capital letter');
  });

  it('should warn about spaces in entity type', () => {
    const result = normalizeEntityType('API Key');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('contains spaces');
    expect(result.warnings[0]).toContain('APIKey'); // Note: all words are capitalized
  });

  it('should not warn for properly formatted types', () => {
    const result = normalizeEntityType('Person');
    expect(result.normalized).toBe('Person');
    expect(result.warnings).toHaveLength(0);
  });

  it('should handle both lowercase and spaces', () => {
    const result = normalizeEntityType('api key');
    expect(result.normalized).toBe('Api key');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('Save Memory Request Validation', () => {
  it('should pass a valid request', () => {
    const entities: SaveMemoryEntity[] = [
      {
        name: 'Entity1',
        entityType: 'Person',
        observations: ['Works at Google'],
        relations: [{ targetEntity: 'Entity2', relationType: 'knows' }]
      },
      {
        name: 'Entity2',
        entityType: 'Person',
        observations: ['Works at Microsoft'],
        relations: [{ targetEntity: 'Entity1', relationType: 'knows' }]
      }
    ];
    const result = validateSaveMemoryRequest(entities);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should collect multiple validation errors', () => {
    const entities: SaveMemoryEntity[] = [
      {
        name: 'Entity1',
        entityType: 'person',
        observations: ['a'.repeat(151)], // Too long
        relations: [] // No relations
      }
    ];
    const result = validateSaveMemoryRequest(entities);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it('should apply entity type normalization', () => {
    const entities: SaveMemoryEntity[] = [
      {
        name: 'Entity1',
        entityType: 'person',
        observations: ['Test'],
        relations: [{ targetEntity: 'Entity2', relationType: 'knows' }]
      },
      {
        name: 'Entity2',
        entityType: 'document',
        observations: ['Test'],
        relations: [{ targetEntity: 'Entity1', relationType: 'owned by' }]
      }
    ];
    const result = validateSaveMemoryRequest(entities);
    expect(entities[0].entityType).toBe('Person');
    expect(entities[1].entityType).toBe('Document');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('Quality Score Calculation', () => {
  it('should return 0 for empty entity array', () => {
    const score = calculateQualityScore([]);
    expect(score).toBe(0);
  });

  it('should give higher scores for more relations', () => {
    const lowRelations: SaveMemoryEntity[] = [
      {
        name: 'Entity1',
        entityType: 'Test',
        observations: ['Test'],
        relations: [{ targetEntity: 'Entity2', relationType: 'relates to' }]
      }
    ];
    const highRelations: SaveMemoryEntity[] = [
      {
        name: 'Entity1',
        entityType: 'Test',
        observations: ['Test'],
        relations: [
          { targetEntity: 'Entity2', relationType: 'relates to' },
          { targetEntity: 'Entity3', relationType: 'uses' },
          { targetEntity: 'Entity4', relationType: 'contains' }
        ]
      }
    ];
    const lowScore = calculateQualityScore(lowRelations);
    const highScore = calculateQualityScore(highRelations);
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it('should give higher scores for shorter observations', () => {
    const longObs: SaveMemoryEntity[] = [
      {
        name: 'Entity1',
        entityType: 'Test',
        observations: ['a'.repeat(150)], // Max length
        relations: [{ targetEntity: 'Entity2', relationType: 'relates to' }]
      }
    ];
    const shortObs: SaveMemoryEntity[] = [
      {
        name: 'Entity1',
        entityType: 'Test',
        observations: ['Short'], // Very short
        relations: [{ targetEntity: 'Entity2', relationType: 'relates to' }]
      }
    ];
    const longScore = calculateQualityScore(longObs);
    const shortScore = calculateQualityScore(shortObs);
    expect(shortScore).toBeGreaterThan(longScore);
  });

  it('should return score between 0 and 1', () => {
    const entities: SaveMemoryEntity[] = [
      {
        name: 'Entity1',
        entityType: 'Test',
        observations: ['Medium length observation'],
        relations: [{ targetEntity: 'Entity2', relationType: 'relates to' }]
      }
    ];
    const score = calculateQualityScore(entities);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
