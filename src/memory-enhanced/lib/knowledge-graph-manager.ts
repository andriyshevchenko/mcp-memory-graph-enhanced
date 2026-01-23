/**
 * KnowledgeGraphManager - Main class for managing the knowledge graph
 * Acts as a facade to coordinate operations across different services
 */

import { Entity, Relation, KnowledgeGraph, Observation } from './types.js';
import { IStorageAdapter } from './storage-interface.js';
import { JsonlStorageAdapter } from './jsonl-storage-adapter.js';

// Import CRUD operations
import * as EntityOps from './operations/entity-operations.js';
import * as RelationOps from './operations/relation-operations.js';
import * as ObservationOps from './operations/observation-operations.js';

// Import query operations
import * as GraphReader from './queries/graph-reader.js';
import * as SearchService from './queries/search-service.js';
import * as EntityQueries from './queries/entity-queries.js';

// Import analysis services
import * as MemoryStats from './analysis/memory-stats.js';
import * as PathFinder from './analysis/path-finder.js';
import * as ConflictDetector from './analysis/conflict-detector.js';
import * as ContextBuilder from './analysis/context-builder.js';
import * as AnalyticsService from './analysis/analytics-service.js';

// Import maintenance services
import * as MemoryPruner from './maintenance/memory-pruner.js';
import * as BulkUpdater from './maintenance/bulk-updater.js';

// Import versioning services
import * as ObservationHistory from './versioning/observation-history.js';

// Import collaboration services
import * as FlagManager from './collaboration/flag-manager.js';
import * as ConversationService from './collaboration/conversation-service.js';

export class KnowledgeGraphManager {
  private storage: IStorageAdapter;
  private initializePromise: Promise<void> | null = null;
  
  constructor(memoryDirPath: string, storageAdapter?: IStorageAdapter) {
    this.storage = storageAdapter || new JsonlStorageAdapter(memoryDirPath);
    // Lazy initialization - will be called on first operation
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

  // Entity Operations
  async createEntities(entities: Entity[]): Promise<Entity[]> {
    await this.ensureInitialized();
    return EntityOps.createEntities(this.storage, entities);
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    await this.ensureInitialized();
    return EntityOps.deleteEntities(this.storage, entityNames);
  }

  // Relation Operations
  async createRelations(relations: Relation[]): Promise<Relation[]> {
    await this.ensureInitialized();
    return RelationOps.createRelations(this.storage, relations);
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    await this.ensureInitialized();
    return RelationOps.deleteRelations(this.storage, relations);
  }

  // Observation Operations
  async addObservations(observations: {
    entityName: string;
    contents: string[];
    agentThreadId: string;
    timestamp: string;
    confidence: number;
    importance: number;
  }[]): Promise<{ entityName: string; addedObservations: Observation[] }[]> {
    await this.ensureInitialized();
    return ObservationOps.addObservations(this.storage, observations);
  }

  async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    await this.ensureInitialized();
    return ObservationOps.deleteObservations(this.storage, deletions);
  }

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
    return ObservationOps.updateObservation(this.storage, params);
  }

  // Graph Reading Operations
  async readGraph(): Promise<KnowledgeGraph> {
    await this.ensureInitialized();
    return GraphReader.readGraph(this.storage);
  }

  // Search Operations
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    await this.ensureInitialized();
    return SearchService.searchNodes(this.storage, query);
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    await this.ensureInitialized();
    return SearchService.openNodes(this.storage, names);
  }

  async queryNodes(filters?: {
    timestampStart?: string;
    timestampEnd?: string;
    confidenceMin?: number;
    confidenceMax?: number;
    importanceMin?: number;
    importanceMax?: number;
  }): Promise<KnowledgeGraph> {
    await this.ensureInitialized();
    return SearchService.queryNodes(this.storage, filters);
  }

  // Entity Query Operations
  async getAllEntityNames(): Promise<Set<string>> {
    await this.ensureInitialized();
    return EntityQueries.getAllEntityNames(this.storage);
  }

  async getEntityNamesInThread(threadId: string): Promise<Set<string>> {
    await this.ensureInitialized();
    return EntityQueries.getEntityNamesInThread(this.storage, threadId);
  }

  async listEntities(
    threadId?: string,
    entityType?: string,
    namePattern?: string
  ): Promise<Array<{ name: string; entityType: string }>> {
    await this.ensureInitialized();
    return EntityQueries.listEntities(this.storage, threadId, entityType, namePattern);
  }

  // Memory Statistics & Insights
  async getMemoryStats(): Promise<{
    entityCount: number;
    relationCount: number;
    threadCount: number;
    entityTypes: { [type: string]: number };
    avgConfidence: number;
    avgImportance: number;
    recentActivity: { timestamp: string; entityCount: number }[];
  }> {
    await this.ensureInitialized();
    return MemoryStats.getMemoryStats(this.storage);
  }

  async getRecentChanges(since: string): Promise<KnowledgeGraph> {
    await this.ensureInitialized();
    return MemoryStats.getRecentChanges(this.storage, since);
  }

  // Analysis Operations
  async findRelationPath(from: string, to: string, maxDepth: number = 5): Promise<{
    found: boolean;
    path: string[];
    relations: Relation[];
  }> {
    await this.ensureInitialized();
    return PathFinder.findRelationPath(this.storage, from, to, maxDepth);
  }

  async detectConflicts(): Promise<{
    entityName: string;
    conflicts: { obs1: string; obs2: string; reason: string }[];
  }[]> {
    await this.ensureInitialized();
    return ConflictDetector.detectConflicts(this.storage);
  }

  async getContext(entityNames: string[], depth: number = 1): Promise<KnowledgeGraph> {
    await this.ensureInitialized();
    return ContextBuilder.getContext(this.storage, entityNames, depth);
  }

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
    await this.ensureInitialized();
    return AnalyticsService.getAnalytics(this.storage, threadId);
  }

  // Memory Maintenance
  async pruneMemory(options: {
    olderThan?: string;
    importanceLessThan?: number;
    keepMinEntities?: number;
  }): Promise<{ removedEntities: number; removedRelations: number }> {
    await this.ensureInitialized();
    return MemoryPruner.pruneMemory(this.storage, options);
  }

  async bulkUpdate(updates: {
    entityName: string;
    confidence?: number;
    importance?: number;
    addObservations?: string[];
  }[]): Promise<{ updated: number; notFound: string[] }> {
    await this.ensureInitialized();
    return BulkUpdater.bulkUpdate(this.storage, updates);
  }

  // Collaboration Features
  async flagForReview(entityName: string, reason: string, reviewer?: string): Promise<void> {
    await this.ensureInitialized();
    return FlagManager.flagForReview(this.storage, entityName, reason, reviewer);
  }

  async getFlaggedEntities(): Promise<Entity[]> {
    await this.ensureInitialized();
    return FlagManager.getFlaggedEntities(this.storage);
  }

  async listConversations(): Promise<{
    conversations: Array<{
      agentThreadId: string;
      entityCount: number;
      relationCount: number;
      lastUpdated: string;
      firstCreated: string;
    }>;
  }> {
    await this.ensureInitialized();
    return ConversationService.listConversations(this.storage);
  }

  // Observation Versioning
  async getObservationHistory(entityName: string, observationId: string): Promise<Observation[]> {
    await this.ensureInitialized();
    return ObservationHistory.getObservationHistory(this.storage, entityName, observationId);
  }
}
