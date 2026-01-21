import { promises as fs } from 'fs';
import path from 'path';
import { Entity, Relation, KnowledgeGraph, Observation } from './types.js';
import { validateObservation, validateEntityType } from './validation.js';

export class KnowledgeGraphManager {
  private static readonly NEGATION_WORDS = new Set(['not', 'no', 'never', 'neither', 'none', 'doesn\'t', 'don\'t', 'isn\'t', 'aren\'t']);
  
  constructor(private memoryDirPath: string) {}

  private getThreadFilePath(agentThreadId: string): string {
    return path.join(this.memoryDirPath, `thread-${agentThreadId}.jsonl`);
  }

  private async loadGraphFromFile(filePath: string): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(filePath, "utf-8");
      const lines = data.split("\n").filter(line => line.trim() !== "");
      return lines.reduce((graph: KnowledgeGraph, line) => {
        let item: any;
        try {
          item = JSON.parse(line);
        } catch (parseError) {
          console.warn(`Skipping malformed JSON line in ${filePath} (line length: ${line.length} chars)`);
          return graph;
        }
        
        if (item.type === "entity") {
          // Validate required fields
          if (!item.name || !item.entityType || !Array.isArray(item.observations) || 
              !item.agentThreadId || !item.timestamp || 
              typeof item.confidence !== 'number' || typeof item.importance !== 'number') {
            console.warn(`Skipping entity with missing required fields in ${filePath}`);
            return graph;
          }
          graph.entities.push({
            name: item.name,
            entityType: item.entityType,
            observations: item.observations,
            observationsV2: item.observationsV2, // Support new versioned observations
            agentThreadId: item.agentThreadId,
            timestamp: item.timestamp,
            confidence: item.confidence,
            importance: item.importance
          });
        }
        if (item.type === "relation") {
          // Validate required fields
          if (!item.from || !item.to || !item.relationType || 
              !item.agentThreadId || !item.timestamp || 
              typeof item.confidence !== 'number' || typeof item.importance !== 'number') {
            console.warn(`Skipping relation with missing required fields in ${filePath}`);
            return graph;
          }
          graph.relations.push({
            from: item.from,
            to: item.to,
            relationType: item.relationType,
            agentThreadId: item.agentThreadId,
            timestamp: item.timestamp,
            confidence: item.confidence,
            importance: item.importance
          });
        }
        return graph;
      }, { entities: [], relations: [] });
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  private async loadGraph(): Promise<KnowledgeGraph> {
    const files = await fs.readdir(this.memoryDirPath).catch(() => []);
    const threadFiles = files.filter(f => f.startsWith('thread-') && f.endsWith('.jsonl'));
    
    const graphs = await Promise.all(
      threadFiles.map(f => this.loadGraphFromFile(path.join(this.memoryDirPath, f)))
    );
    
    return graphs.reduce((acc: KnowledgeGraph, graph: KnowledgeGraph) => ({
      entities: [...acc.entities, ...graph.entities],
      relations: [...acc.relations, ...graph.relations]
    }), { entities: [], relations: [] });
  }

  private async saveGraphForThread(agentThreadId: string, entities: Entity[], relations: Relation[]): Promise<void> {
    const threadFilePath = this.getThreadFilePath(agentThreadId);
    const lines = [
      ...entities.map(e => JSON.stringify({
        type: "entity",
        name: e.name,
        entityType: e.entityType,
        observations: e.observations,
        observationsV2: e.observationsV2, // Save versioned observations
        agentThreadId: e.agentThreadId,
        timestamp: e.timestamp,
        confidence: e.confidence,
        importance: e.importance
      })),
      ...relations.map(r => JSON.stringify({
        type: "relation",
        from: r.from,
        to: r.to,
        relationType: r.relationType,
        agentThreadId: r.agentThreadId,
        timestamp: r.timestamp,
        confidence: r.confidence,
        importance: r.importance
      })),
    ];
    
    // Avoid creating or keeping empty files when there is no data for this thread
    if (lines.length === 0) {
      try {
        await fs.unlink(threadFilePath);
      } catch (error) {
        // Only ignore ENOENT errors (file doesn't exist)
        if (error instanceof Error && 'code' in error && (error as any).code !== 'ENOENT') {
          console.warn(`Failed to delete empty thread file ${threadFilePath}:`, error);
        }
      }
      return;
    }
    
    await fs.writeFile(threadFilePath, lines.join("\n"));
  }

  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    // Group entities and relations by agentThreadId
    const threadMap = new Map<string, { entities: Entity[], relations: Relation[] }>();
    
    for (const entity of graph.entities) {
      if (!threadMap.has(entity.agentThreadId)) {
        threadMap.set(entity.agentThreadId, { entities: [], relations: [] });
      }
      threadMap.get(entity.agentThreadId)!.entities.push(entity);
    }
    
    for (const relation of graph.relations) {
      if (!threadMap.has(relation.agentThreadId)) {
        threadMap.set(relation.agentThreadId, { entities: [], relations: [] });
      }
      threadMap.get(relation.agentThreadId)!.relations.push(relation);
    }
    
    // Save each thread's data to its own file
    await Promise.all(
      Array.from(threadMap.entries()).map(([threadId, data]) => 
        this.saveGraphForThread(threadId, data.entities, data.relations)
      )
    );
    
    // Clean up stale thread files that no longer have data
    try {
      const files = await fs.readdir(this.memoryDirPath).catch(() => []);
      const threadFiles = files.filter(f => f.startsWith('thread-') && f.endsWith('.jsonl'));
      
      await Promise.all(
        threadFiles.map(async (fileName) => {
          // Extract threadId from filename: thread-{agentThreadId}.jsonl
          const match = fileName.match(/^thread-(.+)\.jsonl$/);
          if (match) {
            const threadId = match[1];
            if (!threadMap.has(threadId)) {
              const filePath = path.join(this.memoryDirPath, fileName);
              try {
                await fs.unlink(filePath);
              } catch (error) {
                // Only log non-ENOENT errors
                if (error instanceof Error && 'code' in error && (error as any).code !== 'ENOENT') {
                  console.warn(`Failed to delete stale thread file ${filePath}:`, error);
                }
              }
            }
          }
        })
      );
    } catch (error) {
      // Best-effort cleanup: log but don't fail the save operation
      console.warn('Failed to clean up stale thread files:', error);
    }
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    // Entity names are globally unique across all threads in the collaborative knowledge graph
    // This prevents duplicate entities while allowing multiple threads to contribute to the same entity
    const newEntities = entities.filter(e => !graph.entities.some(existingEntity => existingEntity.name === e.name));
    graph.entities.push(...newEntities);
    await this.saveGraph(graph);
    return newEntities;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.loadGraph();
    
    // Validate that referenced entities exist
    const entityNames = new Set(graph.entities.map(e => e.name));
    const validRelations = relations.filter(r => {
      if (!entityNames.has(r.from) || !entityNames.has(r.to)) {
        console.warn(`Skipping relation ${r.from} -> ${r.to}: one or both entities do not exist`);
        return false;
      }
      return true;
    });
    
    // Relations are globally unique by (from, to, relationType) across all threads
    // This enables multiple threads to collaboratively build the knowledge graph
    const newRelations = validRelations.filter(r => !graph.relations.some(existingRelation => 
      existingRelation.from === r.from && 
      existingRelation.to === r.to && 
      existingRelation.relationType === r.relationType
    ));
    graph.relations.push(...newRelations);
    await this.saveGraph(graph);
    return newRelations;
  }

  async addObservations(observations: { entityName: string; contents: string[]; agentThreadId: string; timestamp: string; confidence: number; importance: number }[]): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const graph = await this.loadGraph();
    const results = observations.map(o => {
      const entity = graph.entities.find(e => e.name === o.entityName);
      if (!entity) {
        throw new Error(`Entity with name ${o.entityName} not found`);
      }
      const newObservations = o.contents.filter(content => !entity.observations.includes(content));
      entity.observations.push(...newObservations);
      // Update metadata based on this operation, but keep original agentThreadId
      // to maintain thread file consistency and avoid orphaned data
      entity.timestamp = o.timestamp;
      entity.confidence = o.confidence;
      entity.importance = o.importance;
      return { entityName: o.entityName, addedObservations: newObservations };
    });
    await this.saveGraph(graph);
    return results;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
    graph.relations = graph.relations.filter(r => !entityNames.includes(r.from) && !entityNames.includes(r.to));
    await this.saveGraph(graph);
  }

  async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    const graph = await this.loadGraph();
    deletions.forEach(d => {
      const entity = graph.entities.find(e => e.name === d.entityName);
      if (entity) {
        entity.observations = entity.observations.filter(o => !d.observations.includes(o));
      }
    });
    await this.saveGraph(graph);
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const graph = await this.loadGraph();
    // Delete relations globally across all threads by matching (from, to, relationType)
    // In a collaborative knowledge graph, deletions affect all threads
    graph.relations = graph.relations.filter(r => !relations.some(delRelation => 
      r.from === delRelation.from && 
      r.to === delRelation.to && 
      r.relationType === delRelation.relationType
    ));
    await this.saveGraph(graph);
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => 
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.entityType.toLowerCase().includes(query.toLowerCase()) ||
      e.observations.some(o => o.toLowerCase().includes(query.toLowerCase()))
    );
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
  
    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  
    return filteredGraph;
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => names.includes(e.name));
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
  
    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  
    return filteredGraph;
  }

  async queryNodes(filters?: {
    timestampStart?: string;
    timestampEnd?: string;
    confidenceMin?: number;
    confidenceMax?: number;
    importanceMin?: number;
    importanceMax?: number;
  }): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // If no filters provided, return entire graph
    if (!filters) {
      return graph;
    }
    
    // Apply filters to entities
    const filteredEntities = graph.entities.filter(e => {
      // Timestamp range filter
      if (filters.timestampStart && e.timestamp < filters.timestampStart) return false;
      if (filters.timestampEnd && e.timestamp > filters.timestampEnd) return false;
      
      // Confidence range filter
      if (filters.confidenceMin !== undefined && e.confidence < filters.confidenceMin) return false;
      if (filters.confidenceMax !== undefined && e.confidence > filters.confidenceMax) return false;
      
      // Importance range filter
      if (filters.importanceMin !== undefined && e.importance < filters.importanceMin) return false;
      if (filters.importanceMax !== undefined && e.importance > filters.importanceMax) return false;
      
      return true;
    });
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Apply filters to relations (and ensure they connect filtered entities)
    const filteredRelations = graph.relations.filter(r => {
      // Must connect filtered entities
      if (!filteredEntityNames.has(r.from) || !filteredEntityNames.has(r.to)) return false;
      
      // Timestamp range filter
      if (filters.timestampStart && r.timestamp < filters.timestampStart) return false;
      if (filters.timestampEnd && r.timestamp > filters.timestampEnd) return false;
      
      // Confidence range filter
      if (filters.confidenceMin !== undefined && r.confidence < filters.confidenceMin) return false;
      if (filters.confidenceMax !== undefined && r.confidence > filters.confidenceMax) return false;
      
      // Importance range filter
      if (filters.importanceMin !== undefined && r.importance < filters.importanceMin) return false;
      if (filters.importanceMax !== undefined && r.importance > filters.importanceMax) return false;
      
      return true;
    });
  
    return {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  }

  // Enhancement 1: Memory Statistics & Insights
  async getMemoryStats(): Promise<{
    entityCount: number;
    relationCount: number;
    threadCount: number;
    entityTypes: { [type: string]: number };
    avgConfidence: number;
    avgImportance: number;
    recentActivity: { timestamp: string; entityCount: number }[];
  }> {
    const graph = await this.loadGraph();
    
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

  // Enhancement 2: Get recent changes
  async getRecentChanges(since: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    const sinceDate = new Date(since);
    
    // Only return entities and relations that were actually modified since the specified time
    const recentEntities = graph.entities.filter(e => new Date(e.timestamp) >= sinceDate);
    const recentEntityNames = new Set(recentEntities.map(e => e.name));
    
    // Only include relations that are recent themselves
    const recentRelations = graph.relations.filter(r => new Date(r.timestamp) >= sinceDate);
    
    return {
      entities: recentEntities,
      relations: recentRelations
    };
  }

  // Enhancement 3: Relationship path finding
  async findRelationPath(from: string, to: string, maxDepth: number = 5): Promise<{
    found: boolean;
    path: string[];
    relations: Relation[];
  }> {
    const graph = await this.loadGraph();
    
    if (from === to) {
      return { found: true, path: [from], relations: [] };
    }
    
    // BFS to find shortest path
    const queue: { entity: string; path: string[]; relations: Relation[] }[] = [
      { entity: from, path: [from], relations: [] }
    ];
    const visited = new Set<string>([from]);
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (current.path.length > maxDepth) {
        continue;
      }
      
      // Find all relations connected to current entity (both outgoing and incoming for bidirectional search)
      const outgoing = graph.relations.filter(r => r.from === current.entity);
      const incoming = graph.relations.filter(r => r.to === current.entity);
      
      // Check outgoing relations
      for (const rel of outgoing) {
        if (rel.to === to) {
          return {
            found: true,
            path: [...current.path, rel.to],
            relations: [...current.relations, rel]
          };
        }
        
        if (!visited.has(rel.to)) {
          visited.add(rel.to);
          queue.push({
            entity: rel.to,
            path: [...current.path, rel.to],
            relations: [...current.relations, rel]
          });
        }
      }
      
      // Check incoming relations (traverse backwards)
      for (const rel of incoming) {
        if (rel.from === to) {
          return {
            found: true,
            path: [...current.path, rel.from],
            relations: [...current.relations, rel]
          };
        }
        
        if (!visited.has(rel.from)) {
          visited.add(rel.from);
          queue.push({
            entity: rel.from,
            path: [...current.path, rel.from],
            relations: [...current.relations, rel]
          });
        }
      }
    }
    
    return { found: false, path: [], relations: [] };
  }

  // Enhancement 4: Detect conflicting observations
  async detectConflicts(): Promise<{
    entityName: string;
    conflicts: { obs1: string; obs2: string; reason: string }[];
  }[]> {
    const graph = await this.loadGraph();
    const conflicts: { entityName: string; conflicts: { obs1: string; obs2: string; reason: string }[] }[] = [];
    
    for (const entity of graph.entities) {
      const entityConflicts: { obs1: string; obs2: string; reason: string }[] = [];
      
      for (let i = 0; i < entity.observations.length; i++) {
        for (let j = i + 1; j < entity.observations.length; j++) {
          const obs1 = entity.observations[i].toLowerCase();
          const obs2 = entity.observations[j].toLowerCase();
          
          // Check for negation patterns
          const obs1HasNegation = Array.from(KnowledgeGraphManager.NEGATION_WORDS).some(word => obs1.includes(word));
          const obs2HasNegation = Array.from(KnowledgeGraphManager.NEGATION_WORDS).some(word => obs2.includes(word));
          
          // If one has negation and they share key words, might be a conflict
          if (obs1HasNegation !== obs2HasNegation) {
            const words1 = obs1.split(/\s+/).filter(w => w.length > 3);
            const words2Set = new Set(obs2.split(/\s+/).filter(w => w.length > 3));
            const commonWords = words1.filter(w => words2Set.has(w) && !KnowledgeGraphManager.NEGATION_WORDS.has(w));
            
            if (commonWords.length >= 2) {
              entityConflicts.push({
                obs1: entity.observations[i],
                obs2: entity.observations[j],
                reason: 'Potential contradiction with negation'
              });
            }
          }
        }
      }
      
      if (entityConflicts.length > 0) {
        conflicts.push({ entityName: entity.name, conflicts: entityConflicts });
      }
    }
    
    return conflicts;
  }

  // Enhancement 5: Memory pruning
  async pruneMemory(options: {
    olderThan?: string;
    importanceLessThan?: number;
    keepMinEntities?: number;
  }): Promise<{ removedEntities: number; removedRelations: number }> {
    const graph = await this.loadGraph();
    const initialEntityCount = graph.entities.length;
    const initialRelationCount = graph.relations.length;
    
    // Filter entities to remove
    let entitiesToKeep = graph.entities;
    
    if (options.olderThan) {
      const cutoffDate = new Date(options.olderThan);
      entitiesToKeep = entitiesToKeep.filter(e => new Date(e.timestamp) >= cutoffDate);
    }
    
    if (options.importanceLessThan !== undefined) {
      entitiesToKeep = entitiesToKeep.filter(e => e.importance >= options.importanceLessThan!);
    }
    
    // Ensure we keep minimum entities
    // If keepMinEntities is set and we need more entities, take from the already-filtered set
    // sorted by importance and recency
    if (options.keepMinEntities && entitiesToKeep.length < options.keepMinEntities) {
      // Sort the filtered entities by importance and timestamp, keep the most important and recent
      const sorted = [...entitiesToKeep].sort((a, b) => {
        if (a.importance !== b.importance) return b.importance - a.importance;
        return b.timestamp.localeCompare(a.timestamp);
      });
      // If we still don't have enough, we keep what we have
      entitiesToKeep = sorted.slice(0, Math.min(options.keepMinEntities, sorted.length));
    }
    
    const keptEntityNames = new Set(entitiesToKeep.map(e => e.name));
    
    // Remove relations that reference removed entities
    const relationsToKeep = graph.relations.filter(r => 
      keptEntityNames.has(r.from) && keptEntityNames.has(r.to)
    );
    
    graph.entities = entitiesToKeep;
    graph.relations = relationsToKeep;
    await this.saveGraph(graph);
    
    return {
      removedEntities: initialEntityCount - entitiesToKeep.length,
      removedRelations: initialRelationCount - relationsToKeep.length
    };
  }

  // Enhancement 6: Batch operations
  async bulkUpdate(updates: {
    entityName: string;
    confidence?: number;
    importance?: number;
    addObservations?: string[];
  }[]): Promise<{ updated: number; notFound: string[] }> {
    const graph = await this.loadGraph();
    let updated = 0;
    const notFound: string[] = [];
    
    for (const update of updates) {
      const entity = graph.entities.find(e => e.name === update.entityName);
      if (!entity) {
        notFound.push(update.entityName);
        continue;
      }
      
      if (update.confidence !== undefined) {
        entity.confidence = update.confidence;
      }
      if (update.importance !== undefined) {
        entity.importance = update.importance;
      }
      if (update.addObservations) {
        const newObs = update.addObservations.filter(obs => !entity.observations.includes(obs));
        entity.observations.push(...newObs);
      }
      
      entity.timestamp = new Date().toISOString();
      updated++;
    }
    
    await this.saveGraph(graph);
    return { updated, notFound };
  }

  // Enhancement 7: Flag for review (Human-in-the-Loop)
  async flagForReview(entityName: string, reason: string, reviewer?: string): Promise<void> {
    const graph = await this.loadGraph();
    const entity = graph.entities.find(e => e.name === entityName);
    
    if (!entity) {
      throw new Error(`Entity with name ${entityName} not found`);
    }
    
    // Add a special observation to mark for review
    const flagObservation = `[FLAGGED FOR REVIEW: ${reason}${reviewer ? ` - Reviewer: ${reviewer}` : ''}]`;
    if (!entity.observations.includes(flagObservation)) {
      entity.observations.push(flagObservation);
      entity.timestamp = new Date().toISOString();
      await this.saveGraph(graph);
    }
  }

  // Enhancement 8: Get entities flagged for review
  async getFlaggedEntities(): Promise<Entity[]> {
    const graph = await this.loadGraph();
    return graph.entities.filter(e => 
      e.observations.some(obs => obs.includes('[FLAGGED FOR REVIEW:'))
    );
  }

  // Enhancement 9: Get context (entities related to a topic/entity)
  async getContext(entityNames: string[], depth: number = 1): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    const contextEntityNames = new Set<string>(entityNames);
    
    // Expand to include related entities up to specified depth
    for (let d = 0; d < depth; d++) {
      const currentEntities = Array.from(contextEntityNames);
      for (const entityName of currentEntities) {
        // Find all relations involving this entity
        const relatedRelations = graph.relations.filter(r => 
          r.from === entityName || r.to === entityName
        );
        
        // Add related entities
        relatedRelations.forEach(r => {
          contextEntityNames.add(r.from);
          contextEntityNames.add(r.to);
        });
      }
    }
    
    // Get all entities and relations in context
    const contextEntities = graph.entities.filter(e => contextEntityNames.has(e.name));
    const contextRelations = graph.relations.filter(r => 
      contextEntityNames.has(r.from) && contextEntityNames.has(r.to)
    );
    
    return {
      entities: contextEntities,
      relations: contextRelations
    };
  }

  // Enhancement 10: List conversations (agent threads)
  async listConversations(): Promise<{
    conversations: Array<{
      agentThreadId: string;
      entityCount: number;
      relationCount: number;
      lastUpdated: string;
      firstCreated: string;
    }>;
  }> {
    const graph = await this.loadGraph();
    
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

  // Phase 1: save_memory implementation
  async saveMemory(input: {
    entities: Array<{
      name: string;
      entityType: string;
      observations: string[];
      relations: Array<{
        targetEntity: string;
        relationType: string;
        importance?: number;
      }>;
      confidence?: number;
      importance?: number;
    }>;
    threadId: string;
  }): Promise<{
    success: boolean;
    created: { entities: number; relations: number };
    warnings: string[];
    quality_score: number;
    validation_errors?: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const timestamp = new Date().toISOString();

    // Validate all entities and observations first
    for (const entity of input.entities) {
      // Validate entity has at least one relation
      if (!entity.relations || entity.relations.length === 0) {
        errors.push(`Entity '${entity.name}' must have at least 1 relation`);
      }

      // Validate each observation
      for (const obs of entity.observations) {
        const validation = validateObservation(obs);
        if (!validation.valid) {
          errors.push(`Entity '${entity.name}': ${validation.error}`);
        }
      }

      // Validate entity type (soft validation)
      const typeValidation = validateEntityType(entity.entityType);
      warnings.push(...typeValidation.warnings);

      // Validate relation targets exist in the same request
      const entityNames = new Set(input.entities.map(e => e.name));
      for (const rel of entity.relations) {
        if (!entityNames.has(rel.targetEntity)) {
          errors.push(`Entity '${entity.name}': Target entity '${rel.targetEntity}' not found in request. All relations must reference entities in the same save_memory call.`);
        }
      }
    }

    // If validation failed, return errors
    if (errors.length > 0) {
      return {
        success: false,
        created: { entities: 0, relations: 0 },
        warnings,
        quality_score: 0,
        validation_errors: errors
      };
    }

    // Create entities
    const entitiesToCreate: Entity[] = input.entities.map(e => ({
      name: e.name,
      entityType: e.entityType,
      observations: e.observations,
      agentThreadId: input.threadId,
      timestamp,
      confidence: e.confidence ?? 1.0,
      importance: e.importance ?? 0.5
    }));

    const createdEntities = await this.createEntities(entitiesToCreate);

    // Create relations
    const relationsToCreate: Relation[] = [];
    for (const entity of input.entities) {
      for (const rel of entity.relations) {
        relationsToCreate.push({
          from: entity.name,
          to: rel.targetEntity,
          relationType: rel.relationType,
          agentThreadId: input.threadId,
          timestamp,
          confidence: 1.0,
          importance: rel.importance ?? 0.7
        });
      }
    }

    const createdRelations = await this.createRelations(relationsToCreate);

    // Calculate quality score
    const avgRelationsPerEntity = relationsToCreate.length / input.entities.length;
    const quality_score = Math.min(1.0, avgRelationsPerEntity / 3); // 3+ relations = perfect score

    return {
      success: true,
      created: {
        entities: createdEntities.length,
        relations: createdRelations.length
      },
      warnings,
      quality_score
    };
  }

  // Phase 2: Add observations with versioning
  async addObservationsV2(observations: {
    entityName: string;
    contents: string[];
    agentThreadId: string;
    timestamp: string;
    confidence: number;
    importance: number;
  }[]): Promise<{ entityName: string; addedObservations: Observation[] }[]> {
    const graph = await this.loadGraph();
    const results = observations.map(o => {
      const entity = graph.entities.find(e => e.name === o.entityName);
      if (!entity) {
        throw new Error(`Entity with name ${o.entityName} not found`);
      }

      // Initialize observationsV2 if not exists
      if (!entity.observationsV2) {
        // Migrate legacy observations to versioned format
        const migrationBaseTime = Date.now();
        entity.observationsV2 = entity.observations.map((content, idx) => ({
          id: `obs_${migrationBaseTime}_${idx}`,
          content,
          timestamp: entity.timestamp,
          version: 1,
          agentThreadId: entity.agentThreadId,
          confidence: entity.confidence,
          importance: entity.importance
        }));
      }

      const addedObservations: Observation[] = [];
      let obsCounter = 0;
      const addTime = Date.now();
      for (const content of o.contents) {
        // Check if observation already exists
        const existing = entity.observationsV2.find(obs => obs.content === content);
        if (!existing) {
          const newObs: Observation = {
            id: `obs_${addTime}_${obsCounter++}`,
            content,
            timestamp: o.timestamp,
            version: 1,
            agentThreadId: o.agentThreadId,
            confidence: o.confidence,
            importance: o.importance
          };
          entity.observationsV2.push(newObs);
          addedObservations.push(newObs);

          // Also add to legacy observations array for backward compatibility
          if (!entity.observations.includes(content)) {
            entity.observations.push(content);
          }
        }
      }

      // Update metadata
      entity.timestamp = o.timestamp;
      entity.confidence = o.confidence;
      entity.importance = o.importance;

      return { entityName: o.entityName, addedObservations };
    });

    await this.saveGraph(graph);
    return results;
  }

  // Phase 2: Get observation history
  async getObservationHistory(entityName: string): Promise<{
    entityName: string;
    observations: Observation[];
  }> {
    const graph = await this.loadGraph();
    const entity = graph.entities.find(e => e.name === entityName);

    if (!entity) {
      throw new Error(`Entity with name ${entityName} not found`);
    }

    // Return all observations with version history
    return {
      entityName,
      observations: entity.observationsV2 || []
    };
  }

  // Phase 3: Get analytics
  async getAnalytics(threadId: string): Promise<{
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
    const graph = await this.loadGraph();

    // Filter by threadId
    const entities = graph.entities.filter(e => e.agentThreadId === threadId);
    const relations = graph.relations.filter(r => r.agentThreadId === threadId);

    // 1. Recent changes (last 10, chronological)
    // Note: Perfect created vs updated detection would require separate createdAt/updatedAt timestamps.
    // Current heuristic: Check if any observation has version > 1 (indicating update).
    // Limitation: Multiple version-1 observations or non-observation updates won't be detected as updates.
    const recent_changes = entities
      .map(e => {
        const hasMultipleVersions = e.observationsV2 && e.observationsV2.some(obs => obs.version > 1);
        return {
          entityName: e.name,
          entityType: e.entityType,
          lastModified: e.timestamp,
          changeType: hasMultipleVersions ? 'updated' as const : 'created' as const
        };
      })
      .sort((a, b) => b.lastModified.localeCompare(a.lastModified))
      .slice(0, 10);

    // 2. Top by importance (top 10)
    const top_important = entities
      .map(e => ({
        entityName: e.name,
        entityType: e.entityType,
        importance: e.importance,
        observationCount: e.observations.length
      }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10);

    // 3. Most connected entities (top 10)
    const relationCounts = new Map<string, Set<string>>();
    for (const rel of relations) {
      if (!relationCounts.has(rel.from)) {
        relationCounts.set(rel.from, new Set());
      }
      relationCounts.get(rel.from)!.add(rel.to);

      if (!relationCounts.has(rel.to)) {
        relationCounts.set(rel.to, new Set());
      }
      relationCounts.get(rel.to)!.add(rel.from);
    }

    const most_connected = entities
      .map(e => ({
        entityName: e.name,
        entityType: e.entityType,
        relationCount: relationCounts.get(e.name)?.size || 0,
        connectedTo: Array.from(relationCounts.get(e.name) || [])
      }))
      .sort((a, b) => b.relationCount - a.relationCount)
      .slice(0, 10);

    // 4. Orphaned entities (no relations or broken relations)
    const entityNames = new Set(entities.map(e => e.name));
    const orphaned_entities: Array<{
      entityName: string;
      entityType: string;
      reason: 'no_relations' | 'broken_relation';
    }> = [];

    for (const entity of entities) {
      const hasRelations = relations.some(r => r.from === entity.name || r.to === entity.name);
      if (!hasRelations) {
        orphaned_entities.push({
          entityName: entity.name,
          entityType: entity.entityType,
          reason: 'no_relations'
        });
      } else {
        // Check for broken relations
        const entityRelations = relations.filter(r => r.from === entity.name || r.to === entity.name);
        const hasBrokenRelation = entityRelations.some(r => 
          !entityNames.has(r.from) || !entityNames.has(r.to)
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

    return {
      recent_changes,
      top_important,
      most_connected,
      orphaned_entities
    };
  }
}
