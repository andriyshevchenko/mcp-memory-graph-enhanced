/**
 * Conversation service (agent threads)
 */

import { Entity, Relation } from '../types.js';
import { IStorageAdapter } from '../storage-interface.js';

/**
 * List all conversations (agent threads) with summary information
 */
export async function listConversations(storage: IStorageAdapter): Promise<{
  conversations: Array<{
    agentThreadId: string;
    entityCount: number;
    relationCount: number;
    lastUpdated: string;
    firstCreated: string;
  }>;
}> {
  const graph = await storage.loadGraph();
  
  // Group data by agent thread
  const threadMap = new Map<string, {
    entities: Entity[];
    relations: Relation[];
    timestamps: string[];
  }>();
  
  // Collect entities by thread
  for (const entity of graph.entities) {
    if (!threadMap.has(entity.agentThreadId)) {
      threadMap.set(entity.agentThreadId, { entities: [], relations: [], timestamps: [] });
    }
    const threadData = threadMap.get(entity.agentThreadId)!;
    threadData.entities.push(entity);
    threadData.timestamps.push(entity.timestamp);
  }
  
  // Collect relations by thread
  for (const relation of graph.relations) {
    if (!threadMap.has(relation.agentThreadId)) {
      threadMap.set(relation.agentThreadId, { entities: [], relations: [], timestamps: [] });
    }
    const threadData = threadMap.get(relation.agentThreadId)!;
    threadData.relations.push(relation);
    threadData.timestamps.push(relation.timestamp);
  }
  
  // Build conversation summaries
  const conversations = Array.from(threadMap.entries()).map(([agentThreadId, data]) => {
    const timestamps = data.timestamps.sort((a, b) => a.localeCompare(b));
    return {
      agentThreadId,
      entityCount: data.entities.length,
      relationCount: data.relations.length,
      firstCreated: timestamps[0] || '',
      lastUpdated: timestamps[timestamps.length - 1] || ''
    };
  });
  
  // Sort by last updated (most recent first)
  conversations.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
  
  return { conversations };
}
