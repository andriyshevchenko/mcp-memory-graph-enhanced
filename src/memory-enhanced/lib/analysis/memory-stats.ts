/**
 * Memory statistics service
 */

import { IStorageAdapter } from '../storage-interface.js';

/**
 * Get comprehensive memory statistics for a specific thread
 * Filtered by threadId for thread isolation
 */
export async function getMemoryStats(storage: IStorageAdapter, threadId: string): Promise<{
  entityCount: number;
  relationCount: number;
  threadCount: number;
  entityTypes: { [type: string]: number };
  avgConfidence: number;
  avgImportance: number;
  recentActivity: { timestamp: string; entityCount: number }[];
}> {
  const graph = await storage.loadGraph();
  
  // Filter entities and relations by threadId
  const threadEntities = graph.entities.filter(e => e.agentThreadId === threadId);
  const threadRelations = graph.relations.filter(r => r.agentThreadId === threadId);
  
  // Count entity types
  const entityTypes: { [type: string]: number } = {};
  threadEntities.forEach(e => {
    entityTypes[e.entityType] = (entityTypes[e.entityType] || 0) + 1;
  });
  
  // Calculate averages
  const avgConfidence = threadEntities.length > 0
    ? threadEntities.reduce((sum, e) => sum + e.confidence, 0) / threadEntities.length
    : 0;
  const avgImportance = threadEntities.length > 0
    ? threadEntities.reduce((sum, e) => sum + e.importance, 0) / threadEntities.length
    : 0;
  
  // Count unique threads in this specific thread (will always be 1)
  const threads = new Set([threadId]);
  
  // Recent activity (last 7 days, grouped by day) - only for this thread
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentEntities = threadEntities.filter(e => new Date(e.timestamp) >= sevenDaysAgo);
  
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
    entityCount: threadEntities.length,
    relationCount: threadRelations.length,
    threadCount: threads.size,
    entityTypes,
    avgConfidence,
    avgImportance,
    recentActivity
  };
}

/**
 * Get recent changes since a specific timestamp for a specific thread
 * Filtered by threadId for thread isolation
 */
export async function getRecentChanges(
  storage: IStorageAdapter,
  threadId: string,
  since: string
) {
  const graph = await storage.loadGraph();
  const sinceDate = new Date(since);
  
  // Only return entities and relations from this thread that were modified since the specified time
  const recentEntities = graph.entities.filter(e => 
    e.agentThreadId === threadId && new Date(e.timestamp) >= sinceDate
  );
  
  // Only include relations from this thread that are recent themselves
  const recentRelations = graph.relations.filter(r => 
    r.agentThreadId === threadId && new Date(r.timestamp) >= sinceDate
  );
  
  return {
    entities: recentEntities,
    relations: recentRelations
  };
}
