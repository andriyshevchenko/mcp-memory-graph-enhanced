#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Define memory directory path using environment variable with fallback
export const defaultMemoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory-data');

export async function ensureMemoryDirectory(): Promise<string> {
  const memoryDir = process.env.MEMORY_DIR_PATH 
    ? (path.isAbsolute(process.env.MEMORY_DIR_PATH)
        ? process.env.MEMORY_DIR_PATH
        : path.join(path.dirname(fileURLToPath(import.meta.url)), process.env.MEMORY_DIR_PATH))
    : defaultMemoryDir;
  
  // Ensure directory exists
  try {
    await fs.mkdir(memoryDir, { recursive: true });
  } catch (error) {
    // Ignore error if directory already exists
  }
  
  return memoryDir;
}

// Initialize memory directory path (will be set during startup)
let MEMORY_DIR_PATH: string;

// Observation with versioning support
export interface Observation {
  id: string;
  content: string;
  timestamp: string;
  version: number;
  supersedes?: string; // ID of previous observation (if updated)
  agentThreadId: string;
  confidence: number;
  importance: number;
}

// Enhanced entity with metadata
export interface Entity {
  name: string;
  entityType: string;
  observations: string[]; // Legacy: string array for backward compatibility
  observationsV2?: Observation[]; // New: versioned observations
  agentThreadId: string;
  timestamp: string;
  confidence: number;
  importance: number; // 0-1: importance for memory integrity (0=not important, 1=critical)
}

// Enhanced relation with metadata
export interface Relation {
  from: string;
  to: string;
  relationType: string;
  agentThreadId: string;
  timestamp: string;
  confidence: number;
  importance: number; // 0-1: importance for memory integrity (0=not important, 1=critical)
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
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

  // Phase 1: Validation functions for save_memory
  validateObservation(obs: string): { valid: boolean; error?: string } {
    const MAX_LENGTH = 150;
    const MAX_SENTENCES = 2;

    if (obs.length > MAX_LENGTH) {
      return {
        valid: false,
        error: `Observation too long (${obs.length} chars). Max ${MAX_LENGTH}. Split into multiple observations.`
      };
    }

    // Note: Simple sentence splitting - may count abbreviations (e.g., "Mr.", "U.S.A.") as sentence ends
    // This is intentional to keep validation simple and encourage truly atomic observations
    const sentences = obs.split(/[.!?]/).filter(s => s.trim().length > 0);
    if (sentences.length > MAX_SENTENCES) {
      return {
        valid: false,
        error: `Too many sentences (${sentences.length}). Max ${MAX_SENTENCES}. One fact per observation.`
      };
    }

    return { valid: true };
  }

  validateEntityType(entityType: string): { warnings: string[] } {
    const warnings: string[] = [];

    // Check if starts with lowercase
    if (entityType.length > 0 && entityType[0] === entityType[0].toLowerCase()) {
      warnings.push(`Entity type '${entityType}' starts with lowercase. Consider '${entityType[0].toUpperCase() + entityType.slice(1)}' (convention: capitalize first letter)`);
    }

    // Check for spaces
    if (entityType.includes(' ')) {
      warnings.push(`Entity type '${entityType}' contains spaces. Consider using camelCase or removing spaces.`);
    }

    return { warnings };
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
        const validation = this.validateObservation(obs);
        if (!validation.valid) {
          errors.push(`Entity '${entity.name}': ${validation.error}`);
        }
      }

      // Validate entity type (soft validation)
      const typeValidation = this.validateEntityType(entity.entityType);
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
        entity.observationsV2 = entity.observations.map((content, idx) => ({
          id: `obs_${Date.now()}_${idx}`,
          content,
          timestamp: entity.timestamp,
          version: 1,
          agentThreadId: entity.agentThreadId,
          confidence: entity.confidence,
          importance: entity.importance
        }));
      }

      const addedObservations: Observation[] = [];
      for (const content of o.contents) {
        // Check if observation already exists
        const existing = entity.observationsV2.find(obs => obs.content === content);
        if (!existing) {
          const newObs: Observation = {
            id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
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
    // Note: Determining created vs updated requires tracking entity creation time separately from last update
    // For now, we use the timestamp field which may reflect either creation or last update
    const recent_changes = entities
      .map(e => {
        // If entity has observationsV2 with multiple versions, it's been updated
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

let knowledgeGraphManager: KnowledgeGraphManager;

// Zod schemas for enhanced entities and relations
const EntitySchema = z.object({
  name: z.string().describe("The name of the entity"),
  entityType: z.string().describe("The type of the entity"),
  observations: z.array(z.string()).describe("An array of observation contents associated with the entity"),
  agentThreadId: z.string().describe("The agent thread ID that created this entity"),
  timestamp: z.string().describe("ISO 8601 timestamp of when the entity was created"),
  confidence: z.number().min(0).max(1).describe("Confidence coefficient from 0 to 1"),
  importance: z.number().min(0).max(1).describe("Importance for memory integrity if lost: 0 (not important) to 1 (critical)")
});

const RelationSchema = z.object({
  from: z.string().describe("The name of the entity where the relation starts"),
  to: z.string().describe("The name of the entity where the relation ends"),
  relationType: z.string().describe("The type of the relation"),
  agentThreadId: z.string().describe("The agent thread ID that created this relation"),
  timestamp: z.string().describe("ISO 8601 timestamp of when the relation was created"),
  confidence: z.number().min(0).max(1).describe("Confidence coefficient from 0 to 1"),
  importance: z.number().min(0).max(1).describe("Importance for memory integrity if lost: 0 (not important) to 1 (critical)")
});

// The server instance and tools exposed to Claude
const server = new McpServer({
  name: "memory-enhanced-server",
  version: "0.2.0",
});

// Register create_entities tool (DEPRECATED - use save_memory instead)
server.registerTool(
  "create_entities",
  {
    title: "Create Entities (DEPRECATED)",
    description: "[DEPRECATED: Use save_memory instead] Create multiple new entities in the knowledge graph with metadata (agent thread ID, timestamp, confidence, importance)",
    inputSchema: {
      entities: z.array(EntitySchema)
    },
    outputSchema: {
      entities: z.array(EntitySchema)
    }
  },
  async ({ entities }) => {
    const result = await knowledgeGraphManager.createEntities(entities);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: { entities: result }
    };
  }
);

// Register create_relations tool (DEPRECATED - use save_memory instead)
server.registerTool(
  "create_relations",
  {
    title: "Create Relations (DEPRECATED)",
    description: "[DEPRECATED: Use save_memory instead] Create multiple new relations between entities in the knowledge graph with metadata (agent thread ID, timestamp, confidence, importance). Relations should be in active voice",
    inputSchema: {
      relations: z.array(RelationSchema)
    },
    outputSchema: {
      relations: z.array(RelationSchema)
    }
  },
  async ({ relations }) => {
    const result = await knowledgeGraphManager.createRelations(relations);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: { relations: result }
    };
  }
);

// Phase 1: Register save_memory tool (NEW - recommended approach)
server.registerTool(
  "save_memory",
  {
    title: "Save Memory (Recommended)",
    description: "Save entities and their relations to memory graph in a single atomic operation. RULES: 1) Each observation max 150 chars (atomic facts only). 2) Each entity MUST have at least 1 relation. This is the recommended way to save memory.",
    inputSchema: {
      entities: z.array(z.object({
        name: z.string().min(1).max(100).describe("The name of the entity"),
        entityType: z.string().min(1).max(50).describe("Type of entity (e.g., Person, Document, File, or custom types like Patient, API). Convention: start with capital letter."),
        observations: z.array(z.string().min(5).max(150)).min(1).describe("Array of atomic facts. Each must be ONE fact, max 150 chars."),
        relations: z.array(z.object({
          targetEntity: z.string().describe("Name of entity to connect to (must exist in this request)"),
          relationType: z.string().max(50).describe("Type of relationship (e.g., 'created by', 'contains', 'uses')"),
          importance: z.number().min(0).max(1).optional().default(0.7).describe("Importance of this relation (0-1)")
        })).min(1).describe("REQUIRED: Every entity must have at least 1 relation"),
        confidence: z.number().min(0).max(1).optional().default(1.0).describe("Confidence in this entity (0-1)"),
        importance: z.number().min(0).max(1).optional().default(0.5).describe("Importance of this entity (0-1)")
      })).min(1),
      threadId: z.string().min(1).describe("Thread ID for this conversation/project")
    },
    outputSchema: {
      success: z.boolean(),
      created: z.object({
        entities: z.number(),
        relations: z.number()
      }),
      warnings: z.array(z.string()),
      quality_score: z.number().min(0).max(1),
      validation_errors: z.array(z.string()).optional()
    }
  },
  async ({ entities, threadId }) => {
    const result = await knowledgeGraphManager.saveMemory({ entities, threadId });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

// Register add_observations tool
server.registerTool(
  "add_observations",
  {
    title: "Add Observations",
    description: "Add new observations to existing entities in the knowledge graph with metadata (agent thread ID, timestamp, confidence, importance)",
    inputSchema: {
      observations: z.array(z.object({
        entityName: z.string().describe("The name of the entity to add the observations to"),
        contents: z.array(z.string()).describe("An array of observation contents to add"),
        agentThreadId: z.string().describe("The agent thread ID adding these observations"),
        timestamp: z.string().describe("ISO 8601 timestamp of when the observations are added"),
        confidence: z.number().min(0).max(1).describe("Confidence coefficient from 0 to 1"),
        importance: z.number().min(0).max(1).describe("Importance for memory integrity if lost: 0 (not important) to 1 (critical)")
      }))
    },
    outputSchema: {
      results: z.array(z.object({
        entityName: z.string(),
        addedObservations: z.array(z.string())
      }))
    }
  },
  async ({ observations }) => {
    const result = await knowledgeGraphManager.addObservations(observations);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: { results: result }
    };
  }
);

// Register delete_entities tool
server.registerTool(
  "delete_entities",
  {
    title: "Delete Entities",
    description: "Delete multiple entities and their associated relations from the knowledge graph",
    inputSchema: {
      entityNames: z.array(z.string()).describe("An array of entity names to delete")
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string()
    }
  },
  async ({ entityNames }) => {
    await knowledgeGraphManager.deleteEntities(entityNames);
    return {
      content: [{ type: "text" as const, text: "Entities deleted successfully" }],
      structuredContent: { success: true, message: "Entities deleted successfully" }
    };
  }
);

// Register delete_observations tool
server.registerTool(
  "delete_observations",
  {
    title: "Delete Observations",
    description: "Delete specific observations from entities in the knowledge graph",
    inputSchema: {
      deletions: z.array(z.object({
        entityName: z.string().describe("The name of the entity containing the observations"),
        observations: z.array(z.string()).describe("An array of observations to delete")
      }))
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string()
    }
  },
  async ({ deletions }) => {
    await knowledgeGraphManager.deleteObservations(deletions);
    return {
      content: [{ type: "text" as const, text: "Observations deleted successfully" }],
      structuredContent: { success: true, message: "Observations deleted successfully" }
    };
  }
);

// Register delete_relations tool
server.registerTool(
  "delete_relations",
  {
    title: "Delete Relations",
    description: "Delete multiple relations from the knowledge graph",
    inputSchema: {
      relations: z.array(RelationSchema).describe("An array of relations to delete")
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string()
    }
  },
  async ({ relations }) => {
    await knowledgeGraphManager.deleteRelations(relations);
    return {
      content: [{ type: "text" as const, text: "Relations deleted successfully" }],
      structuredContent: { success: true, message: "Relations deleted successfully" }
    };
  }
);

// Register read_graph tool
server.registerTool(
  "read_graph",
  {
    title: "Read Graph",
    description: "Read the entire knowledge graph",
    inputSchema: {},
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    }
  },
  async () => {
    const graph = await knowledgeGraphManager.readGraph();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

// Register search_nodes tool
server.registerTool(
  "search_nodes",
  {
    title: "Search Nodes",
    description: "Search for nodes in the knowledge graph based on a query",
    inputSchema: {
      query: z.string().describe("The search query to match against entity names, types, and observation content")
    },
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    }
  },
  async ({ query }) => {
    const graph = await knowledgeGraphManager.searchNodes(query);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

// Register open_nodes tool
server.registerTool(
  "open_nodes",
  {
    title: "Open Nodes",
    description: "Open specific nodes in the knowledge graph by their names",
    inputSchema: {
      names: z.array(z.string()).describe("An array of entity names to retrieve")
    },
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    }
  },
  async ({ names }) => {
    const graph = await knowledgeGraphManager.openNodes(names);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

// Register query_nodes tool for advanced filtering
server.registerTool(
  "query_nodes",
  {
    title: "Query Nodes",
    description: "Query nodes and relations in the knowledge graph with advanced filtering by timestamp, confidence, and importance ranges",
    inputSchema: {
      timestampStart: z.string().optional().describe("ISO 8601 timestamp - filter for items created on or after this time"),
      timestampEnd: z.string().optional().describe("ISO 8601 timestamp - filter for items created on or before this time"),
      confidenceMin: z.number().min(0).max(1).optional().describe("Minimum confidence value (0-1)"),
      confidenceMax: z.number().min(0).max(1).optional().describe("Maximum confidence value (0-1)"),
      importanceMin: z.number().min(0).max(1).optional().describe("Minimum importance value (0-1)"),
      importanceMax: z.number().min(0).max(1).optional().describe("Maximum importance value (0-1)")
    },
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    }
  },
  async (filters) => {
    const graph = await knowledgeGraphManager.queryNodes(filters);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

// Register get_memory_stats tool
server.registerTool(
  "get_memory_stats",
  {
    title: "Get Memory Statistics",
    description: "Get comprehensive statistics about the knowledge graph including entity counts, thread activity, and confidence/importance metrics",
    inputSchema: {},
    outputSchema: {
      entityCount: z.number(),
      relationCount: z.number(),
      threadCount: z.number(),
      entityTypes: z.record(z.number()),
      avgConfidence: z.number(),
      avgImportance: z.number(),
      recentActivity: z.array(z.object({
        timestamp: z.string(),
        entityCount: z.number()
      }))
    }
  },
  async () => {
    const stats = await knowledgeGraphManager.getMemoryStats();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }],
      structuredContent: stats
    };
  }
);

// Register get_recent_changes tool
server.registerTool(
  "get_recent_changes",
  {
    title: "Get Recent Changes",
    description: "Retrieve entities and relations that were created or modified since a specific timestamp",
    inputSchema: {
      since: z.string().describe("ISO 8601 timestamp - return changes since this time")
    },
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    }
  },
  async ({ since }) => {
    const changes = await knowledgeGraphManager.getRecentChanges(since);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(changes, null, 2) }],
      structuredContent: { ...changes }
    };
  }
);

// Register find_relation_path tool
server.registerTool(
  "find_relation_path",
  {
    title: "Find Relationship Path",
    description: "Find a path of relationships connecting two entities in the knowledge graph",
    inputSchema: {
      from: z.string().describe("Starting entity name"),
      to: z.string().describe("Target entity name"),
      maxDepth: z.number().optional().default(5).describe("Maximum path depth to search (default: 5)")
    },
    outputSchema: {
      found: z.boolean(),
      path: z.array(z.string()),
      relations: z.array(RelationSchema)
    }
  },
  async ({ from, to, maxDepth }) => {
    const result = await knowledgeGraphManager.findRelationPath(from, to, maxDepth || 5);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

// Register detect_conflicts tool
server.registerTool(
  "detect_conflicts",
  {
    title: "Detect Conflicts",
    description: "Detect potentially conflicting observations within entities using pattern matching and negation detection",
    inputSchema: {},
    outputSchema: {
      conflicts: z.array(z.object({
        entityName: z.string(),
        conflicts: z.array(z.object({
          obs1: z.string(),
          obs2: z.string(),
          reason: z.string()
        }))
      }))
    }
  },
  async () => {
    const conflicts = await knowledgeGraphManager.detectConflicts();
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ conflicts }, null, 2) }],
      structuredContent: { conflicts }
    };
  }
);

// Register prune_memory tool
server.registerTool(
  "prune_memory",
  {
    title: "Prune Memory",
    description: "Remove old or low-importance entities to manage memory size, with option to keep minimum number of entities",
    inputSchema: {
      olderThan: z.string().optional().describe("ISO 8601 timestamp - remove entities older than this"),
      importanceLessThan: z.number().min(0).max(1).optional().describe("Remove entities with importance less than this value"),
      keepMinEntities: z.number().optional().describe("Minimum number of entities to keep regardless of filters")
    },
    outputSchema: {
      removedEntities: z.number(),
      removedRelations: z.number()
    }
  },
  async (options) => {
    const result = await knowledgeGraphManager.pruneMemory(options);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

// Register bulk_update tool
server.registerTool(
  "bulk_update",
  {
    title: "Bulk Update",
    description: "Efficiently update multiple entities at once with new confidence, importance, or observations",
    inputSchema: {
      updates: z.array(z.object({
        entityName: z.string(),
        confidence: z.number().min(0).max(1).optional(),
        importance: z.number().min(0).max(1).optional(),
        addObservations: z.array(z.string()).optional()
      }))
    },
    outputSchema: {
      updated: z.number(),
      notFound: z.array(z.string())
    }
  },
  async ({ updates }) => {
    const result = await knowledgeGraphManager.bulkUpdate(updates);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

// Register flag_for_review tool
server.registerTool(
  "flag_for_review",
  {
    title: "Flag Entity for Review",
    description: "Mark an entity for human review with a specific reason (Human-in-the-Loop)",
    inputSchema: {
      entityName: z.string().describe("Name of entity to flag"),
      reason: z.string().describe("Reason for flagging"),
      reviewer: z.string().optional().describe("Optional reviewer name")
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string()
    }
  },
  async ({ entityName, reason, reviewer }) => {
    await knowledgeGraphManager.flagForReview(entityName, reason, reviewer);
    return {
      content: [{ type: "text" as const, text: `Entity "${entityName}" flagged for review` }],
      structuredContent: { success: true, message: `Entity "${entityName}" flagged for review` }
    };
  }
);

// Register get_flagged_entities tool
server.registerTool(
  "get_flagged_entities",
  {
    title: "Get Flagged Entities",
    description: "Retrieve all entities that have been flagged for human review",
    inputSchema: {},
    outputSchema: {
      entities: z.array(EntitySchema)
    }
  },
  async () => {
    const entities = await knowledgeGraphManager.getFlaggedEntities();
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ entities }, null, 2) }],
      structuredContent: { entities }
    };
  }
);

// Register get_context tool
server.registerTool(
  "get_context",
  {
    title: "Get Context",
    description: "Retrieve entities and relations related to specified entities up to a certain depth, useful for understanding context around specific topics",
    inputSchema: {
      entityNames: z.array(z.string()).describe("Names of entities to get context for"),
      depth: z.number().optional().default(1).describe("How many relationship hops to include (default: 1)")
    },
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    }
  },
  async ({ entityNames, depth }) => {
    const context = await knowledgeGraphManager.getContext(entityNames, depth || 1);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(context, null, 2) }],
      structuredContent: { ...context }
    };
  }
);

// Register list_conversations tool
server.registerTool(
  "list_conversations",
  {
    title: "List Conversations",
    description: "List all available agent threads (conversations) with their metadata including entity counts, relation counts, and activity timestamps",
    inputSchema: {},
    outputSchema: {
      conversations: z.array(z.object({
        agentThreadId: z.string(),
        entityCount: z.number(),
        relationCount: z.number(),
        firstCreated: z.string(),
        lastUpdated: z.string()
      }))
    }
  },
  async () => {
    const result = await knowledgeGraphManager.listConversations();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

// Phase 2: Register get_observation_history tool
server.registerTool(
  "get_observation_history",
  {
    title: "Get Observation History",
    description: "Retrieve version history of all observations for an entity, including superseded observations",
    inputSchema: {
      entityName: z.string().describe("The name of the entity to get observation history for")
    },
    outputSchema: {
      entityName: z.string(),
      observations: z.array(z.object({
        id: z.string(),
        content: z.string(),
        timestamp: z.string(),
        version: z.number(),
        supersedes: z.string().optional(),
        agentThreadId: z.string(),
        confidence: z.number(),
        importance: z.number()
      }))
    }
  },
  async ({ entityName }) => {
    const result = await knowledgeGraphManager.getObservationHistory(entityName);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

// Phase 3: Register get_analytics tool
server.registerTool(
  "get_analytics",
  {
    title: "Get Analytics",
    description: "Get analytics and insights for a specific thread including recent changes, most important entities, most connected entities, and orphaned entities",
    inputSchema: {
      threadId: z.string().describe("The agent thread ID to get analytics for")
    },
    outputSchema: {
      recent_changes: z.array(z.object({
        entityName: z.string(),
        entityType: z.string(),
        lastModified: z.string(),
        changeType: z.enum(['created', 'updated'])
      })),
      top_important: z.array(z.object({
        entityName: z.string(),
        entityType: z.string(),
        importance: z.number(),
        observationCount: z.number()
      })),
      most_connected: z.array(z.object({
        entityName: z.string(),
        entityType: z.string(),
        relationCount: z.number(),
        connectedTo: z.array(z.string())
      })),
      orphaned_entities: z.array(z.object({
        entityName: z.string(),
        entityType: z.string(),
        reason: z.enum(['no_relations', 'broken_relation'])
      }))
    }
  },
  async ({ threadId }) => {
    const result = await knowledgeGraphManager.getAnalytics(threadId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

async function main() {
  // Initialize memory directory path
  MEMORY_DIR_PATH = await ensureMemoryDirectory();

  // Initialize knowledge graph manager with the memory directory path
  knowledgeGraphManager = new KnowledgeGraphManager(MEMORY_DIR_PATH);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Enhanced Knowledge Graph MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
