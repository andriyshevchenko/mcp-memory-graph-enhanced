/**
 * Memory statistics service
 */

import { IStorageAdapter } from '../storage-interface.js';

/**
 * Get comprehensive memory statistics
 */
export async function getMemoryStats(storage: IStorageAdapter): Promise<{
  entityCount: number;
  relationCount: number;
  threadCount: number;
  entityTypes: { [type: string]: number };
  avgConfidence: number;
  avgImportance: number;
  recentActivity: { timestamp: string; entityCount: number }[];
}> {
  const graph = await storage.loadGraph();
  
  // Count entity types
  const entityTypes: { [type: string]: number } = {};
  graph.entities.forEach(e => {
    entityTypes[e.entityType] = (entityTypes[e.entityType] || 0) + 1;
  });
  
  // Calculate averages
  const avgConfidence = graph.entities.length > 0
    ? graph.entities.reduce((sum, e) => sum + e.confidence, 0) / graph.entities.length
    : 0;
  const avgImportance = graph.entities.length > 0
    ? graph.entities.reduce((sum, e) => sum + e.importance, 0) / graph.entities.length
    : 0;
  
  // Count unique threads
  const threads = new Set([
    ...graph.entities.map(e => e.agentThreadId),
    ...graph.relations.map(r => r.agentThreadId)
  ]);
  
  // Recent activity (last 7 days, grouped by day)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentEntities = graph.entities.filter(e => new Date(e.timestamp) >= sevenDaysAgo);
  
  // Group by day
  const activityByDay: { [day: string]: number } = {};
  recentEntities.forEach(e => {
    const day = e.timestamp.substring(0, 10); // YYYY-MM-DD
    activityByDay[day] = (activityByDay[day] || 0) + 1;
  });
  
  const recentActivity = Object.entries(activityByDay)
    .map(([timestamp, entityCount]) => ({ timestamp, entityCount }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  
  return {
    entityCount: graph.entities.length,
    relationCount: graph.relations.length,
    threadCount: threads.size,
    entityTypes,
    avgConfidence,
    avgImportance,
    recentActivity
  };
}

/**
 * Get recent changes since a specific timestamp
 */
export async function getRecentChanges(
  storage: IStorageAdapter,
  since: string
) {
  const graph = await storage.loadGraph();
  const sinceDate = new Date(since);
  
  // Only return entities and relations that were actually modified since the specified time
  const recentEntities = graph.entities.filter(e => new Date(e.timestamp) >= sinceDate);
  
  // Only include relations that are recent themselves
  const recentRelations = graph.relations.filter(r => new Date(r.timestamp) >= sinceDate);
  
  return {
    entities: recentEntities,
    relations: recentRelations
  };
}
