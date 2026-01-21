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
    const longObs = 'a'.repeat(301);
    const result = validateObservation(longObs);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too long');
    expect(result.error).toContain('301 chars');
  });

  it('should accept observations up to 300 characters', () => {
    const maxLengthObs = 'a'.repeat(300);
    const result = validateObservation(maxLengthObs);
    expect(result.valid).toBe(true);
  });

  it('should accept technical observations with URLs within 300 chars', () => {
    const technicalObs = 'API endpoint at https://api-gateway.production.company.com/v2/services/authentication handles OAuth2 with JWT tokens, 30s timeout, rate limit 1000/min';
    expect(technicalObs.length).toBeLessThanOrEqual(300);
    const result = validateObservation(technicalObs);
    expect(result.valid).toBe(true);
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

  // Tests for smarter sentence detection (technical content)
  it('should accept URLs without counting colons/periods as sentence boundaries', () => {
    const result = validateObservation('URL: https://dvdat-uks-01-es.develastic.nidemo.com/');
    expect(result.valid).toBe(true);
  });

  it('should accept HTTP URLs', () => {
    const result = validateObservation('Service endpoint is http://api.example.com/v1/data');
    expect(result.valid).toBe(true);
  });

  it('should handle URLs with trailing punctuation correctly', () => {
    const result = validateObservation('Visit https://example.com. Documentation available. Support provided.');
    expect(result.valid).toBe(true); // 3 sentences
  });

  it('should accept observations with hostnames', () => {
    const result = validateObservation('Connected to ni-internal-dev.servicebus.windows.net successfully');
    expect(result.valid).toBe(true);
  });

  it('should accept observations with IP addresses', () => {
    const result1 = validateObservation('Server IP is 192.168.1.1 for local access');
    expect(result1.valid).toBe(true);

    const result2 = validateObservation('Connected to 10.0.0.5 on port 8080');
    expect(result2.valid).toBe(true);
  });

  it('should accept observations with Windows file paths', () => {
    const result = validateObservation('Config file located at C:\\Program Files\\App\\config.json');
    expect(result.valid).toBe(true);
  });

  it('should accept observations with multiple technical elements', () => {
    const result = validateObservation('API v2.0 at https://api.example.com uses 192.168.1.100');
    expect(result.valid).toBe(true);
  });

  it('should still correctly count actual sentences with URLs', () => {
    const result = validateObservation('Visit https://example.com for details. Documentation is available. Support is provided.');
    expect(result.valid).toBe(true); // 3 sentences, at the limit
  });

  it('should reject when there are too many actual sentences with URLs', () => {
    const result = validateObservation('Visit https://example.com for details. Documentation is available. Support is provided. Testing complete.');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Too many sentences');
  });

  it('should handle mixed technical content and sentences', () => {
    const result = validateObservation('Server at 10.0.0.1 hosts v2.1.0. Access via https://api.server.com. Ready for use.');
    expect(result.valid).toBe(true); // 3 sentences
  });

  // Test to ensure patterns don't create false positives
  it('should correctly count sentences that have words ending in periods', () => {
    const result = validateObservation('The cat. The dog. The bird. The fish.');
    expect(result.valid).toBe(false); // 4 sentences - should reject
    expect(result.error).toContain('Too many sentences');
  });

  it('should accept regular sentences without technical content', () => {
    const result = validateObservation('This is a regular sentence. Another normal sentence. Third sentence here.');
    expect(result.valid).toBe(true); // 3 sentences, at the limit
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
  it('should pass when all target entities exist in current batch', () => {
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

  it('should reject when target entity does not exist in batch or existing entities', () => {
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
    expect(result.error).toContain('not found in request or existing entities');
  });

  it('should pass when target entity exists in existing entities (cross-thread reference)', () => {
    const entity: SaveMemoryEntity = {
      name: 'Entity1',
      entityType: 'Test',
      observations: ['Test'],
      relations: [
        { targetEntity: 'ExistingEntity', relationType: 'relates to' }
      ]
    };
    const entityNames = new Set(['Entity1']);
    const existingEntityNames = new Set(['ExistingEntity', 'AnotherEntity']);
    const result = validateRelationTargets(entity, entityNames, existingEntityNames);
    expect(result.valid).toBe(true);
  });

  it('should pass when some targets are in batch and some in existing entities', () => {
    const entity: SaveMemoryEntity = {
      name: 'Entity1',
      entityType: 'Test',
      observations: ['Test'],
      relations: [
        { targetEntity: 'Entity2', relationType: 'relates to' },
        { targetEntity: 'ExistingEntity', relationType: 'depends on' }
      ]
    };
    const entityNames = new Set(['Entity1', 'Entity2']);
    const existingEntityNames = new Set(['ExistingEntity']);
    const result = validateRelationTargets(entity, entityNames, existingEntityNames);
    expect(result.valid).toBe(true);
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
        observations: ['a'.repeat(301)], // Too long
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
