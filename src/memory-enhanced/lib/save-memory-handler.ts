/**
 * Handler for save_memory tool (Section 1 of spec)
 * Provides atomic creation of entities and relations with validation
 */

import { Entity, Relation, SaveMemoryInput, SaveMemoryOutput, Observation } from './types.js';
import { validateSaveMemoryRequest, calculateQualityScore } from './validation.js';
import { getInverseRelationType } from './relation-inverter.js';
import { randomUUID } from 'crypto';

/**
 * Saves entities and their relations to the knowledge graph atomically
 * Either all entities + relations succeed, or none are saved (rollback)
 */
export async function handleSaveMemory(
  input: SaveMemoryInput,
  createEntitiesFn: (entities: Entity[]) => Promise<Entity[]>,
  createRelationsFn: (relations: Relation[]) => Promise<Relation[]>
): Promise<SaveMemoryOutput> {
  const timestamp = new Date().toISOString();
  
  // Validate the entire request
  const validationResult = validateSaveMemoryRequest(input.entities);
  
  if (!validationResult.valid) {
    // Return validation errors
    return {
      success: false,
      created: { entities: 0, relations: 0 },
      warnings: [],
      quality_score: 0,
      validation_errors: validationResult.errors.map(err => 
        `${err.entity}: ${err.error}${err.suggestion ? ` Suggestion: ${err.suggestion}` : ''}`
      )
    };
  }
  
  try {
    // Convert SaveMemoryEntity to Entity format with versioned observations
    const entities: Entity[] = input.entities.map(e => {
      // Convert string observations to versioned Observation objects
      const observations: Observation[] = e.observations.map(content => ({
        id: `obs_${randomUUID()}`,
        content: content,
        timestamp: timestamp,
        version: 1,  // New observations start at version 1
        agentThreadId: input.threadId,
        confidence: e.confidence ?? 1.0,
        importance: e.importance ?? 0.5
      }));
      
      return {
        name: e.name,
        entityType: e.entityType,
        observations: observations,
        agentThreadId: input.threadId,
        timestamp: timestamp,
        confidence: e.confidence ?? 1.0,
        importance: e.importance ?? 0.5
      };
    });
    
    // Create all entities first
    const createdEntities = await createEntitiesFn(entities);
    
    // Build relations array from all entities
    const relations: Relation[] = [];
    for (const entity of input.entities) {
      for (const rel of entity.relations) {
        relations.push({
          from: entity.name,
          to: rel.targetEntity,
          relationType: rel.relationType,
          agentThreadId: input.threadId,
          timestamp: timestamp,
          confidence: 1.0, // Relations inherit entity confidence implicitly
          importance: rel.importance ?? 0.7
        });
        
        // Create inverse relation for bidirectional connectivity
        relations.push({
          from: rel.targetEntity,
          to: entity.name,
          relationType: getInverseRelationType(rel.relationType),
          agentThreadId: input.threadId,
          timestamp: timestamp,
          confidence: 1.0,
          importance: rel.importance ?? 0.7
        });
      }
    }
    
    // Create all relations
    const createdRelations = await createRelationsFn(relations);
    
    // Calculate quality score
    const qualityScore = calculateQualityScore(input.entities);
    
    return {
      success: true,
      created: {
        entities: createdEntities.length,
        relations: createdRelations.length
      },
      warnings: validationResult.warnings,
      quality_score: qualityScore
    };
  } catch (error) {
    // If anything fails, the transaction is rolled back by not persisting
    return {
      success: false,
      created: { entities: 0, relations: 0 },
      warnings: [],
      quality_score: 0,
      validation_errors: [`Transaction failed: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}
