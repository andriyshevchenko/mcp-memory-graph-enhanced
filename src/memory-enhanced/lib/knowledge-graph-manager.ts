/**
 * KnowledgeGraphManager - Main class for managing the knowledge graph
 */

import { Entity, Relation, KnowledgeGraph, Observation } from './types.js';
import { randomUUID } from 'crypto';
import { IStorageAdapter } from './storage-interface.js';
import { JsonlStorageAdapter } from './jsonl-storage-adapter.js';

export class KnowledgeGraphManager {
  private static readonly NEGATION_WORDS = new Set(['not', 'no', 'never', 'neither', 'none', 'doesn\'t', 'don\'t', 'isn\'t', 'aren\'t']);
  private storage: IStorageAdapter;
  private initializePromise: Promise<void> | null = null;
  
  constructor(memoryDirPath: string, storageAdapter?: IStorageAdapter) {
    this.storage = storageAdapter || new JsonlStorageAdapter(memoryDirPath);
    // Lazy initialization - will be called on first operation
  }

  /**
   * Check if content contains any negation words (using word boundary matching)
   * Handles punctuation and contractions, avoids creating intermediate Set for performance
   */
  private hasNegation(content: string): boolean {
    // Extract words using word boundary regex, preserving contractions (include apostrophes)
    const lowerContent = content.toLowerCase();
    const wordMatches = lowerContent.match(/\b[\w']+\b/g);
    
    if (!wordMatches) {
      return false;
    }
    
    // Check each word against negation words without creating intermediate Set
    for (const word of wordMatches) {
      if (KnowledgeGraphManager.NEGATION_WORDS.has(word)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create a composite key for relation deduplication.
   * 
   * We explicitly normalize the components to primitive strings to ensure
   * stable serialization and to document the assumption that `from`, `to`,
   * and `relationType` are simple string identifiers.
   */
  private createRelationKey(relation: Relation): string {
    const from = String(relation.from);
    const to = String(relation.to);
    const relationType = String(relation.relationType);
    
    return JSON.stringify([from, to, relationType]);
  }

  /**
   * Ensure storage is initialized before any operation
   * This is called automatically by all public methods
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initializePromise) {
      this.initializePromise = this.storage.initialize();
    }
    await this.initializePromise;
  }

  /**
   * Find an entity by name in the knowledge graph.
   * @param graph - The knowledge graph to search
   * @param entityName - Name of the entity to find
   * @returns The found entity
   * @throws Error if entity not found
   */
  private findEntity(graph: KnowledgeGraph, entityName: string): Entity {
    const entity = graph.entities.find(e => e.name === entityName);
    if (!entity) {
      throw new Error(`Entity '${entityName}' not found`);
    }
    return entity;
  }

  /**
   * Find an observation by ID within an entity.
   * @param entity - The entity containing the observation
   * @param observationId - ID of the observation to find
   * @returns The found observation
   * @throws Error if observation not found
   */
  private findObservation(entity: Entity, observationId: string): Observation {
    const observation = entity.observations.find(o => o.id === observationId);
    if (!observation) {
      throw new Error(`Observation '${observationId}' not found in entity '${entity.name}'`);
    }
    return observation;
  }

  /**
   * Validate that an observation can be updated (not already superseded).
   * @param observation - The observation to validate
   * @throws Error if observation has already been superseded
   */
  private validateObservationNotSuperseded(observation: Observation): void {
    if (observation.superseded_by) {
      throw new Error(
        `Observation '${observation.id}' has already been superseded by '${observation.superseded_by}'. Update the latest version instead.`
      );
    }
  }

  /**
   * Resolve confidence value using inheritance chain: params > observation > entity.
   * @param providedValue - Value provided in parameters (optional)
   * @param observationValue - Value from observation (optional)
   * @param entityValue - Value from entity (fallback)
   * @returns Resolved confidence value
   */
  private resolveInheritedValue(
    providedValue: number | undefined,
    observationValue: number | undefined,
    entityValue: number
  ): number {
    return providedValue ?? observationValue ?? entityValue;
  }

  /**
   * Create a new observation version from an existing observation.
   * @param oldObs - The observation being updated
   * @param entity - The entity containing the observation
   * @param params - Update parameters
   * @returns New observation with incremented version
   */
  private createObservationVersion(
    oldObs: Observation,
    entity: Entity,
    params: {
      newContent: string;
      agentThreadId: string;
      timestamp: string;
      confidence?: number;
      importance?: number;
    }
  ): Observation {
    return {
      id: `obs_${randomUUID()}`,
      content: params.newContent,
      timestamp: params.timestamp,
      version: oldObs.version + 1,
      supersedes: oldObs.id,
      agentThreadId: params.agentThreadId,
      confidence: this.resolveInheritedValue(params.confidence, oldObs.confidence, entity.confidence),
      importance: this.resolveInheritedValue(params.importance, oldObs.importance, entity.importance)
    };
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    await this.ensureInitialized();
    const graph = await this.storage.loadGraph();
    // Entity names are globally unique across all threads in the collaborative knowledge graph
    // This prevents duplicate entities while allowing multiple threads to contribute to the same entity
    const existingNames = new Set(graph.entities.map(e => e.name));
    const newEntities = entities.filter(e => !existingNames.has(e.name));
    graph.entities.push(...newEntities);
    await this.storage.saveGraph(graph);
    return newEntities;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.storage.loadGraph();
    
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
    const existingRelationKeys = new Set(
      graph.relations.map(r => this.createRelationKey(r))
    );
    // Create composite keys once per valid relation to avoid duplicate serialization
    const validRelationsWithKeys = validRelations.map(r => ({
      relation: r,
      key: this.createRelationKey(r)
    }));
    const newRelations = validRelationsWithKeys
      .filter(item => !existingRelationKeys.has(item.key))
      .map(item => item.relation);
    graph.relations.push(...newRelations);
    await this.storage.saveGraph(graph);
    return newRelations;
  }

  async addObservations(observations: { entityName: string; contents: string[]; agentThreadId: string; timestamp: string; confidence: number; importance: number }[]): Promise<{ entityName: string; addedObservations: Observation[] }[]> {
    const graph = await this.storage.loadGraph();
    const results = observations.map(o => {
      const entity = graph.entities.find(e => e.name === o.entityName);
      if (!entity) {
        throw new Error(`Entity with name ${o.entityName} not found`);
      }
      
      // Check for existing observations with same content to create version chain
      const newObservations: Observation[] = [];
      // Build a Set of existing observation contents for efficient lookup (single-pass)
      const existingContents = entity.observations.reduce(
        (set, obs) => {
          if (!obs.superseded_by) {
            set.add(obs.content);
          }
          return set;
        },
        new Set<string>()
      );
      
      for (const content of o.contents) {
        // Check if observation with this content already exists (latest version)
        if (existingContents.has(content)) {
          // Don't add duplicate - observation with this content already exists
          // Versioning is for UPDATES to content, not for re-asserting the same content
          continue;
        }
        
        // Create brand new observation
        const newObs: Observation = {
          id: `obs_${randomUUID()}`,
          content: content,
          timestamp: o.timestamp,
          version: 1,
          agentThreadId: o.agentThreadId,
          confidence: o.confidence,
          importance: o.importance
        };
        
        entity.observations.push(newObs);
        newObservations.push(newObs);
      }
      
      // Update entity metadata
      entity.timestamp = o.timestamp;
      entity.confidence = Math.max(entity.confidence, o.confidence);
      entity.importance = Math.max(entity.importance, o.importance);
      
      return { entityName: o.entityName, addedObservations: newObservations };
    });
    await this.storage.saveGraph(graph);
    return results;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const graph = await this.storage.loadGraph();
    const namesToDelete = new Set(entityNames);
    graph.entities = graph.entities.filter(e => !namesToDelete.has(e.name));
    graph.relations = graph.relations.filter(r => !namesToDelete.has(r.from) && !namesToDelete.has(r.to));
    await this.storage.saveGraph(graph);
  }

  async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    const graph = await this.storage.loadGraph();
    deletions.forEach(d => {
      const entity = graph.entities.find(e => e.name === d.entityName);
      if (entity) {
        // Delete observations by content (for backward compatibility) or by ID
        entity.observations = entity.observations.filter(o => 
          !d.observations.includes(o.content) && !d.observations.includes(o.id)
        );
      }
    });
    await this.storage.saveGraph(graph);
  }

  /**
   * Update an existing observation by creating a new version with updated content.
   * This maintains the version history through the supersedes/superseded_by chain.
   * 
   * @param params - Update parameters
   * @param params.entityName - Name of the entity containing the observation
   * @param params.observationId - ID of the observation to update
   * @param params.newContent - New content for the observation
   * @param params.agentThreadId - Agent thread ID making this update
   * @param params.timestamp - ISO 8601 timestamp of the update
   * @param params.confidence - Optional confidence score (0-1), inherits from old observation if not provided
   * @param params.importance - Optional importance score (0-1), inherits from old observation if not provided
   * @returns The newly created observation with incremented version number
   * @throws Error if entity not found
   * @throws Error if observation not found
   * @throws Error if observation has already been superseded (must update latest version)
   */
  async updateObservation(params: {
    entityName: string;
    observationId: string;
    newContent: string;
    agentThreadId: string;
    timestamp: string;
    confidence?: number;
    importance?: number;
  }): Promise<Observation> {
    await this.ensureInitialized();
    const graph = await this.storage.loadGraph();
    
    // Find and validate the entity and observation
    const entity = this.findEntity(graph, params.entityName);
    const oldObs = this.findObservation(entity, params.observationId);
    this.validateObservationNotSuperseded(oldObs);
    
    // Create new version with inheritance chain
    const newObs = this.createObservationVersion(oldObs, entity, params);
    
    // Link old observation to new one
    oldObs.superseded_by = newObs.id;
    
    // Add new observation to entity
    entity.observations.push(newObs);
    
    // Update entity timestamp
    entity.timestamp = params.timestamp;
    
    await this.storage.saveGraph(graph);
    return newObs;
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const graph = await this.storage.loadGraph();
    // Delete relations globally across all threads by matching (from, to, relationType)
    // In a collaborative knowledge graph, deletions affect all threads
    graph.relations = graph.relations.filter(r => !relations.some(delRelation => 
      r.from === delRelation.from && 
      r.to === delRelation.to && 
      r.relationType === delRelation.relationType
    ));
    await this.storage.saveGraph(graph);
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return this.storage.loadGraph();
  }

  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.storage.loadGraph();
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => 
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.entityType.toLowerCase().includes(query.toLowerCase()) ||
      e.observations.some(o => o.content?.toLowerCase().includes(query.toLowerCase()))
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
    const graph = await this.storage.loadGraph();
    
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
    const graph = await this.storage.loadGraph();
    
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

  /**
   * Get names of all entities that can be referenced in relations.
   * @returns Set of entity names that exist in the graph.
   * 
   * Note: Returns ALL entities globally because entity names are globally unique across
   * all threads in the collaborative knowledge graph (by design - see createEntities).
   * This enables any thread to reference any existing entity, supporting incremental
   * building and cross-thread collaboration. Thread-specific filtering is not needed
   * since entity names cannot conflict across threads.
   */
  async getAllEntityNames(): Promise<Set<string>> {
    const graph = await this.storage.loadGraph();
    const entityNames = new Set<string>();
    
    // Return all entities in the graph that can be referenced
    // This allows incremental building: entities from previous save_memory calls
    // can be referenced in new calls, enabling cross-save entity relations
    for (const entity of graph.entities) {
      entityNames.add(entity.name);
    }
    
    return entityNames;
  }

  /**
   * @deprecated Use {@link getAllEntityNames} instead.
   * 
   * This method is kept for backward compatibility. It accepts a threadId parameter
   * for API consistency but does not use it for filtering; it returns the same
   * global set of entity names as {@link getAllEntityNames}.
   * 
   * @param threadId The thread ID (accepted but not used)
   * @returns Set of entity names that exist in the graph
   */
  async getEntityNamesInThread(threadId: string): Promise<Set<string>> {
    return this.getAllEntityNames();
  }

  /**
   * List entities with optional filtering by type and name pattern
   * @param threadId Optional thread ID to filter by. If not provided, returns entities from all threads.
   * @param entityType Optional entity type filter (exact match)
   * @param namePattern Optional name pattern filter (case-insensitive substring match)
   * @returns Array of entities with name and entityType
   */
  async listEntities(
    threadId?: string,
    entityType?: string,
    namePattern?: string
  ): Promise<Array<{ name: string; entityType: string }>> {
    const graph = await this.storage.loadGraph();
    
    let filteredEntities = graph.entities;
    
    // Filter by thread ID if specified (otherwise returns all threads)
    if (threadId) {
      filteredEntities = filteredEntities.filter(e => e.agentThreadId === threadId);
    }
    
    // Filter by entity type if specified
    if (entityType) {
      filteredEntities = filteredEntities.filter(e => e.entityType === entityType);
    }
    
    // Filter by name pattern if specified (case-insensitive)
    if (namePattern) {
      const pattern = namePattern.toLowerCase();
      filteredEntities = filteredEntities.filter(e => 
        e.name.toLowerCase().includes(pattern)
      );
    }
    
    // Return simplified list with just name and entityType
    return filteredEntities.map(e => ({
      name: e.name,
      entityType: e.entityType
    }));
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
    const graph = await this.storage.loadGraph();
    
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
    const graph = await this.storage.loadGraph();
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

  // Enhancement 3: Relationship path finding
  async findRelationPath(from: string, to: string, maxDepth: number = 5): Promise<{
    found: boolean;
    path: string[];
    relations: Relation[];
  }> {
    const graph = await this.storage.loadGraph();
    
    if (from === to) {
      return { found: true, path: [from], relations: [] };
    }
    
    // Build indexes for efficient relation lookup
    const relationsFrom = new Map<string, Relation[]>();
    const relationsTo = new Map<string, Relation[]>();
    for (const rel of graph.relations) {
      if (!relationsFrom.has(rel.from)) {
        relationsFrom.set(rel.from, []);
      }
      relationsFrom.get(rel.from)!.push(rel);
      
      if (!relationsTo.has(rel.to)) {
        relationsTo.set(rel.to, []);
      }
      relationsTo.get(rel.to)!.push(rel);
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
      const outgoing = relationsFrom.get(current.entity) || [];
      const incoming = relationsTo.get(current.entity) || [];
      
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
    const graph = await this.storage.loadGraph();
    const conflicts: { entityName: string; conflicts: { obs1: string; obs2: string; reason: string }[] }[] = [];
    
    for (const entity of graph.entities) {
      const entityConflicts: { obs1: string; obs2: string; reason: string }[] = [];
      
      for (let i = 0; i < entity.observations.length; i++) {
        for (let j = i + 1; j < entity.observations.length; j++) {
          const obs1Content = entity.observations[i].content.toLowerCase();
          const obs2Content = entity.observations[j].content.toLowerCase();
          
          // Skip if observations are in the same version chain
          if (entity.observations[i].supersedes === entity.observations[j].id || 
              entity.observations[j].supersedes === entity.observations[i].id ||
              entity.observations[i].superseded_by === entity.observations[j].id ||
              entity.observations[j].superseded_by === entity.observations[i].id) {
            continue;
          }
          
          // Check for negation patterns
          const obs1HasNegation = this.hasNegation(obs1Content);
          const obs2HasNegation = this.hasNegation(obs2Content);
          
          // If one has negation and they share key words, might be a conflict
          if (obs1HasNegation !== obs2HasNegation) {
            const words1 = obs1Content.split(/\s+/).filter(w => w.length > 3);
            const words2Set = new Set(obs2Content.split(/\s+/).filter(w => w.length > 3));
            const commonWords = words1.filter(w => words2Set.has(w) && !KnowledgeGraphManager.NEGATION_WORDS.has(w));
            
            if (commonWords.length >= 2) {
              entityConflicts.push({
                obs1: entity.observations[i].content,
                obs2: entity.observations[j].content,
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
    const graph = await this.storage.loadGraph();
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
    await this.storage.saveGraph(graph);
    
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
    const graph = await this.storage.loadGraph();
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
        // Filter out observations that already exist (by content)
        const newObsContents = update.addObservations.filter(obsContent => 
          !entity.observations.some(o => o.content === obsContent)
        );
        
        // Create Observation objects for new observations
        const newObservations: Observation[] = newObsContents.map(content => ({
          id: `obs_${randomUUID()}`,
          content: content,
          timestamp: new Date().toISOString(),
          version: 1,
          agentThreadId: entity.agentThreadId, // Use entity's thread ID
          confidence: update.confidence ?? entity.confidence,
          importance: update.importance ?? entity.importance
        }));
        
        entity.observations.push(...newObservations);
      }
      
      entity.timestamp = new Date().toISOString();
      updated++;
    }
    
    await this.storage.saveGraph(graph);
    return { updated, notFound };
  }

  // Enhancement 7: Flag for review (Human-in-the-Loop)
  async flagForReview(entityName: string, reason: string, reviewer?: string): Promise<void> {
    const graph = await this.storage.loadGraph();
    const entity = graph.entities.find(e => e.name === entityName);
    
    if (!entity) {
      throw new Error(`Entity with name ${entityName} not found`);
    }
    
    // Add a special observation to mark for review
    const flagContent = `[FLAGGED FOR REVIEW: ${reason}${reviewer ? ` - Reviewer: ${reviewer}` : ''}]`;
    
    // Check if this flag already exists (by content)
    if (!entity.observations.some(o => o.content === flagContent)) {
      const flagObservation: Observation = {
        id: `obs_${randomUUID()}`,
        content: flagContent,
        timestamp: new Date().toISOString(),
        version: 1,
        agentThreadId: entity.agentThreadId,
        confidence: 1.0, // Flag observations have full confidence
        importance: 1.0  // Flag observations are highly important
      };
      
      entity.observations.push(flagObservation);
      entity.timestamp = new Date().toISOString();
      await this.storage.saveGraph(graph);
    }
  }

  // Enhancement 8: Get entities flagged for review
  async getFlaggedEntities(): Promise<Entity[]> {
    const graph = await this.storage.loadGraph();
    return graph.entities.filter(e => 
      e.observations.some(obs => obs.content.includes('[FLAGGED FOR REVIEW:'))
    );
  }

  // Enhancement 9: Get context (entities related to a topic/entity)
  async getContext(entityNames: string[], depth: number = 1): Promise<KnowledgeGraph> {
    const graph = await this.storage.loadGraph();
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
    const graph = await this.storage.loadGraph();
    
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

  // Analytics: Get analytics for a specific thread (limited to 4 core metrics)
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
    const graph = await this.storage.loadGraph();
    
    // Filter to thread-specific data
    const threadEntities = graph.entities.filter(e => e.agentThreadId === threadId);
    const threadRelations = graph.relations.filter(r => r.agentThreadId === threadId);
    
    // 1. Recent changes (last 10, sorted by timestamp)
    const recent_changes = threadEntities
      .map(e => ({
        entityName: e.name,
        entityType: e.entityType,
        lastModified: e.timestamp,
        changeType: 'created' as 'created' | 'updated' // Simplified: all are 'created' for now
      }))
      .sort((a, b) => b.lastModified.localeCompare(a.lastModified))
      .slice(0, 10);
    
    // 2. Top by importance (top 10)
    const top_important = threadEntities
      .map(e => ({
        entityName: e.name,
        entityType: e.entityType,
        importance: e.importance,
        observationCount: e.observations.length
      }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10);
    
    // 3. Most connected entities (top 10 by relation count)
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
    
    const most_connected = Array.from(entityRelationCounts.entries())
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
    
    // 4. Orphaned entities (entities with no relations or broken relations)
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
    
    return {
      recent_changes,
      top_important,
      most_connected,
      orphaned_entities
    };
  }

  // Observation Versioning: Get full history chain for an observation
  async getObservationHistory(entityName: string, observationId: string): Promise<Observation[]> {
    const graph = await this.storage.loadGraph();
    
    // Find the entity
    const entity = graph.entities.find(e => e.name === entityName);
    if (!entity) {
      throw new Error(`Entity '${entityName}' not found`);
    }
    
    // Find the starting observation
    const startObs = entity.observations.find(o => o.id === observationId);
    if (!startObs) {
      throw new Error(`Observation '${observationId}' not found in entity '${entityName}'`);
    }
    
    // Build the version chain
    const history: Observation[] = [];
    
    // Trace backwards to find all predecessors
    let currentObs: Observation | undefined = startObs;
    const visited = new Set<string>();
    
    while (currentObs) {
      if (visited.has(currentObs.id)) {
        // Circular reference protection
        break;
      }
      visited.add(currentObs.id);
      history.unshift(currentObs); // Add to beginning for chronological order
      
      // Find predecessor
      if (currentObs.supersedes) {
        currentObs = entity.observations.find(o => o.id === currentObs!.supersedes);
      } else {
        break;
      }
    }
    
    // Trace forwards to find all successors
    let forwardObs: Observation = startObs;
    visited.clear();
    
    while (forwardObs.superseded_by) {
      if (visited.has(forwardObs.superseded_by)) {
        // Circular reference protection
        break;
      }
      const successor = entity.observations.find(o => o.id === forwardObs.superseded_by);
      if (successor) {
        visited.add(successor.id);
        history.push(successor);
        forwardObs = successor;
      } else {
        break;
      }
    }
    
    return history;
  }
}

