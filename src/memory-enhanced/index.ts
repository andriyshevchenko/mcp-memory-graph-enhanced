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

// Enhanced entity with metadata
export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
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
  private static readonly NEGATION_WORDS = ['not', 'no', 'never', 'neither', 'none', 'doesn\'t', 'don\'t', 'isn\'t', 'aren\'t'];
  
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
          graph.entities.push({
            name: item.name,
            entityType: item.entityType,
            observations: item.observations,
            agentThreadId: item.agentThreadId,
            timestamp: item.timestamp,
            confidence: item.confidence,
            importance: item.importance
          });
        }
        if (item.type === "relation") {
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
    // Relations are globally unique by (from, to, relationType) across all threads
    // This enables multiple threads to collaboratively build the knowledge graph
    const newRelations = relations.filter(r => !graph.relations.some(existingRelation => 
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
      // Update metadata if observations were added, but keep original agentThreadId
      // to maintain thread file consistency and avoid orphaned data
      if (newObservations.length > 0) {
        entity.timestamp = o.timestamp;
        entity.confidence = o.confidence;
        entity.importance = o.importance;
      }
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
    
    const recentEntities = graph.entities.filter(e => new Date(e.timestamp) >= sinceDate);
    const recentEntityNames = new Set(recentEntities.map(e => e.name));
    
    const recentRelations = graph.relations.filter(r => 
      new Date(r.timestamp) >= sinceDate ||
      recentEntityNames.has(r.from) ||
      recentEntityNames.has(r.to)
    );
    
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
      
      // Find all outgoing relations from current entity
      const outgoing = graph.relations.filter(r => r.from === current.entity);
      
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
          const obs1HasNegation = KnowledgeGraphManager.NEGATION_WORDS.some(word => obs1.includes(word));
          const obs2HasNegation = KnowledgeGraphManager.NEGATION_WORDS.some(word => obs2.includes(word));
          
          // If one has negation and they share key words, might be a conflict
          if (obs1HasNegation !== obs2HasNegation) {
            const words1 = obs1.split(/\s+/).filter(w => w.length > 3);
            const words2Set = new Set(obs2.split(/\s+/).filter(w => w.length > 3));
            const commonWords = words1.filter(w => words2Set.has(w) && !KnowledgeGraphManager.NEGATION_WORDS.includes(w));
            
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
    if (options.keepMinEntities && entitiesToKeep.length < options.keepMinEntities) {
      // Sort by importance and timestamp, keep the most important and recent
      const sorted = [...graph.entities].sort((a, b) => {
        if (a.importance !== b.importance) return b.importance - a.importance;
        return b.timestamp.localeCompare(a.timestamp);
      });
      entitiesToKeep = sorted.slice(0, options.keepMinEntities);
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
  version: "0.1.0",
});

// Register create_entities tool
server.registerTool(
  "create_entities",
  {
    title: "Create Entities",
    description: "Create multiple new entities in the knowledge graph with metadata (agent thread ID, timestamp, confidence, importance)",
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

// Register create_relations tool
server.registerTool(
  "create_relations",
  {
    title: "Create Relations",
    description: "Create multiple new relations between entities in the knowledge graph with metadata (agent thread ID, timestamp, confidence, importance). Relations should be in active voice",
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
