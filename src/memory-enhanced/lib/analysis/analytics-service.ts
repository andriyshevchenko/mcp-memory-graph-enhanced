/**
 * Analytics service for thread-specific metrics
 */

import { Entity, Relation } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';

/**
 * Calculate recent changes for a thread
 */
function calculateRecentChanges(threadEntities: Entity[]): Array<{
  entityName: string;
  entityType: string;
  lastModified: string;
  changeType: 'created' | 'updated';
}> {
  return threadEntities
    .map(e => ({
      entityName: e.name,
      entityType: e.entityType,
      lastModified: e.timestamp,
      changeType: 'created' as 'created' | 'updated' // Simplified: all are 'created' for now
    }))
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified))
    .slice(0, 10);
}

/**
 * Calculate top important entities for a thread
 */
function calculateTopImportant(threadEntities: Entity[]): Array<{
  entityName: string;
  entityType: string;
  importance: number;
  observationCount: number;
}> {
  return threadEntities
    .map(e => ({
      entityName: e.name,
      entityType: e.entityType,
      importance: e.importance,
      observationCount: e.observations.length
    }))
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 10);
}

/**
 * Calculate most connected entities for a thread
 */
function calculateMostConnected(
  threadEntities: Entity[],
  entityRelationCounts: Map<string, Set<string>>
): Array<{
  entityName: string;
  entityType: string;
  relationCount: number;
  connectedTo: string[];
}> {
  return Array.from(entityRelationCounts.entries())
    .map(([entityName, connectedSet]) => {
      const entity = threadEntities.find(e => e.name === entityName)!;
      return {
        entityName,
        entityType: entity.entityType,
        relationCount: connectedSet.size,
        connectedTo: Array.from(connectedSet)
      };
    })
    .sort((a, b) => b.relationCount - a.relationCount)
    .slice(0, 10);
}

/**
 * Calculate orphaned entities for a thread
 */
function calculateOrphanedEntities(
  threadEntities: Entity[],
  threadRelations: Relation[],
  entityRelationCounts: Map<string, Set<string>>
): Array<{
  entityName: string;
  entityType: string;
  reason: 'no_relations' | 'broken_relation';
}> {
  const orphaned_entities: Array<{
    entityName: string;
    entityType: string;
    reason: 'no_relations' | 'broken_relation';
  }> = [];
  
  const allEntityNames = new Set(threadEntities.map(e => e.name));
  
  for (const entity of threadEntities) {
    const relationCount = entityRelationCounts.get(entity.name)?.size || 0;
    
    if (relationCount === 0) {
      orphaned_entities.push({
        entityName: entity.name,
        entityType: entity.entityType,
        reason: 'no_relations'
      });
    } else {
      // Check for broken relations (pointing to non-existent entities)
      const entityRelations = threadRelations.filter(r => r.from === entity.name || r.to === entity.name);
      const hasBrokenRelation = entityRelations.some(r => 
        !allEntityNames.has(r.from) || !allEntityNames.has(r.to)
      );
      
      if (hasBrokenRelation) {
        orphaned_entities.push({
          entityName: entity.name,
          entityType: entity.entityType,
          reason: 'broken_relation'
        });
      }
    }
  }
  
  return orphaned_entities;
}

/**
 * Get analytics for a specific thread (limited to 4 core metrics)
 */
export async function getAnalytics(
  storage: IStorageAdapter,
  threadId: string
): Promise<{
  recent_changes: Array<{
    entityName: string;
    entityType: string;
    lastModified: string;
    changeType: 'created' | 'updated';
  }>;
  top_important: Array<{
    entityName: string;
    entityType: string;
    importance: number;
    observationCount: number;
  }>;
  most_connected: Array<{
    entityName: string;
    entityType: string;
    relationCount: number;
    connectedTo: string[];
  }>;
  orphaned_entities: Array<{
    entityName: string;
    entityType: string;
    reason: 'no_relations' | 'broken_relation';
  }>;
}> {
  const graph = await storage.loadGraph();
  
  // Filter to thread-specific data
  const threadEntities = graph.entities.filter(e => e.agentThreadId === threadId);
  const threadRelations = graph.relations.filter(r => r.agentThreadId === threadId);
  
  // Calculate all metrics
  const recent_changes = calculateRecentChanges(threadEntities);
  const top_important = calculateTopImportant(threadEntities);
  
  // Build the relation counts map once for both most_connected and orphaned_entities
  const entityRelationCounts = new Map<string, Set<string>>();
  for (const entity of threadEntities) {
    entityRelationCounts.set(entity.name, new Set());
  }
  for (const relation of threadRelations) {
    if (entityRelationCounts.has(relation.from)) {
      entityRelationCounts.get(relation.from)!.add(relation.to);
    }
    if (entityRelationCounts.has(relation.to)) {
      entityRelationCounts.get(relation.to)!.add(relation.from);
    }
  }
  
  const most_connected = calculateMostConnected(threadEntities, entityRelationCounts);
  const orphaned_entities = calculateOrphanedEntities(threadEntities, threadRelations, entityRelationCounts);
  
  return {
    recent_changes,
    top_important,
    most_connected,
    orphaned_entities
  };
}
