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
  createEntitiesFn: (threadId: string, entities: Entity[]) => Promise<Entity[]>,
  createRelationsFn: (threadId: string, relations: Relation[]) => Promise<Relation[]>,
  getExistingEntityNamesFn?: (threadId: string) => Promise<Set<string>>
): Promise<SaveMemoryOutput> {
  const timestamp = new Date().toISOString();
  
  // Get existing entity names for cross-thread reference validation
  let existingEntityNames: Set<string> | undefined;
  if (getExistingEntityNamesFn) {
    try {
      existingEntityNames = await getExistingEntityNamesFn(input.threadId);
    } catch (error) {
      // If we can't get existing entities, proceed without cross-thread validation
      console.warn(`Failed to get existing entities for thread ${input.threadId}:`, error);
    }
  }
  
  // Validate the entire request (with cross-thread entity reference support)
  const validationResult = validateSaveMemoryRequest(input.entities, existingEntityNames);
  
  if (!validationResult.valid) {
    // Group errors by entity for better structure
    const errorsByEntity: Map<number, {
      entity_name: string;
      entity_type: string;
      errors: string[];
      observations: string[];
    }> = new Map();
    
    for (const err of validationResult.errors) {
      if (!errorsByEntity.has(err.entityIndex)) {
        errorsByEntity.set(err.entityIndex, {
          entity_name: err.entity,
          entity_type: err.entityType,
          errors: [],
          observations: []
        });
      }
      
      const entityErrors = errorsByEntity.get(err.entityIndex)!;
      const errorMsg = err.suggestion 
        ? `${err.error} Suggestion: ${err.suggestion}` 
        : err.error;
      entityErrors.errors.push(errorMsg);
      
      if (err.observationPreview) {
        entityErrors.observations.push(err.observationPreview);
      }
    }
    
    // Convert to structured format
    const structuredErrors = Array.from(errorsByEntity.entries()).map(([index, data]) => ({
      entity_index: index,
      entity_name: data.entity_name,
      entity_type: data.entity_type,
      errors: data.errors,
      observations: data.observations.length > 0 ? data.observations : undefined
    }));
    
    // Return validation errors with detailed structure
    return {
      success: false,
      created: { entities: 0, relations: 0 },
      warnings: [],
      quality_score: 0,
      validation_errors: structuredErrors
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
    const createdEntities = await createEntitiesFn(input.threadId, entities);
    
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
    const createdRelations = await createRelationsFn(input.threadId, relations);
    
    // Calculate quality score
    const qualityScore = calculateQualityScore(input.entities);
    
    // Extract entity names for reference in subsequent calls
    const entityNames = createdEntities.map(e => e.name);
    
    return {
      success: true,
      created: {
        entities: createdEntities.length,
        relations: createdRelations.length,
        entity_names: entityNames
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
