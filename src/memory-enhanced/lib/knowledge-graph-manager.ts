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
  async createEntities(threadId: string, entities: Entity[]): Promise<Entity[]> {
    await this.ensureInitialized();
    return EntityOps.createEntities(this.storage, threadId, entities);
  }

  async deleteEntities(threadId: string, entityNames: string[]): Promise<void> {
    await this.ensureInitialized();
    return EntityOps.deleteEntities(this.storage, threadId, entityNames);
  }

  // Relation Operations
  async createRelations(threadId: string, relations: Relation[]): Promise<Relation[]> {
    await this.ensureInitialized();
    return RelationOps.createRelations(this.storage, threadId, relations);
  }

  async deleteRelations(threadId: string, relations: Relation[]): Promise<void> {
    await this.ensureInitialized();
    return RelationOps.deleteRelations(this.storage, threadId, relations);
  }

  // Observation Operations
  async addObservations(threadId: string, observations: {
    entityName: string;
    contents: string[];
    agentThreadId: string;
    timestamp: string;
    confidence: number;
    importance: number;
  }[]): Promise<{ entityName: string; addedObservations: Observation[] }[]> {
    await this.ensureInitialized();
    return ObservationOps.addObservations(this.storage, threadId, observations);
  }

  async deleteObservations(threadId: string, deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    await this.ensureInitialized();
    return ObservationOps.deleteObservations(this.storage, threadId, deletions);
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
  async readGraph(threadId: string): Promise<KnowledgeGraph> {
    await this.ensureInitialized();
    return GraphReader.readGraph(this.storage, threadId);
  }

  // Search Operations
  async searchNodes(threadId: string, query: string): Promise<KnowledgeGraph> {
    await this.ensureInitialized();
    return SearchService.searchNodes(this.storage, threadId, query);
  }

  async openNodes(threadId: string, names: string[]): Promise<KnowledgeGraph> {
    await this.ensureInitialized();
    return SearchService.openNodes(this.storage, threadId, names);
  }

  async queryNodes(threadId: string, filters?: {
    timestampStart?: string;
    timestampEnd?: string;
    confidenceMin?: number;
    confidenceMax?: number;
    importanceMin?: number;
    importanceMax?: number;
  }): Promise<KnowledgeGraph> {
    await this.ensureInitialized();
    return SearchService.queryNodes(this.storage, threadId, filters);
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
    threadId: string,
    entityType?: string,
    namePattern?: string
  ): Promise<Array<{ name: string; entityType: string }>> {
    await this.ensureInitialized();
    return EntityQueries.listEntities(this.storage, threadId, entityType, namePattern);
  }

  // Memory Statistics & Insights
  async getMemoryStats(threadId: string): Promise<{
    entityCount: number;
    relationCount: number;
    threadCount: number;
    entityTypes: { [type: string]: number };
    avgConfidence: number;
    avgImportance: number;
    recentActivity: { timestamp: string; entityCount: number }[];
  }> {
    await this.ensureInitialized();
    return MemoryStats.getMemoryStats(this.storage, threadId);
  }

  async getRecentChanges(threadId: string, since: string): Promise<KnowledgeGraph> {
    await this.ensureInitialized();
    return MemoryStats.getRecentChanges(this.storage, threadId, since);
  }

  // Analysis Operations
  async findRelationPath(threadId: string, from: string, to: string, maxDepth: number = 5): Promise<{
    found: boolean;
    path: string[];
    relations: Relation[];
  }> {
    await this.ensureInitialized();
    return PathFinder.findRelationPath(this.storage, threadId, from, to, maxDepth);
  }

  async detectConflicts(threadId: string): Promise<{
    entityName: string;
    conflicts: { obs1: string; obs2: string; reason: string }[];
  }[]> {
    await this.ensureInitialized();
    return ConflictDetector.detectConflicts(this.storage, threadId);
  }

  async getContext(threadId: string, entityNames: string[], depth: number = 1): Promise<KnowledgeGraph> {
    await this.ensureInitialized();
    return ContextBuilder.getContext(this.storage, threadId, entityNames, depth);
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
  async pruneMemory(threadId: string, options: {
    olderThan?: string;
    importanceLessThan?: number;
    keepMinEntities?: number;
  }): Promise<{ removedEntities: number; removedRelations: number }> {
    await this.ensureInitialized();
    return MemoryPruner.pruneMemory(this.storage, threadId, options);
  }

  async bulkUpdate(threadId: string, updates: {
    entityName: string;
    confidence?: number;
    importance?: number;
    addObservations?: string[];
  }[]): Promise<{ updated: number; notFound: string[] }> {
    await this.ensureInitialized();
    return BulkUpdater.bulkUpdate(this.storage, threadId, updates);
  }

  // Collaboration Features
  async flagForReview(threadId: string, entityName: string, reason: string, reviewer?: string): Promise<void> {
    await this.ensureInitialized();
    return FlagManager.flagForReview(this.storage, threadId, entityName, reason, reviewer);
  }

  async getFlaggedEntities(threadId: string): Promise<Entity[]> {
    await this.ensureInitialized();
    return FlagManager.getFlaggedEntities(this.storage, threadId);
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
  async getObservationHistory(threadId: string, entityName: string, observationId: string): Promise<Observation[]> {
    await this.ensureInitialized();
    return ObservationHistory.getObservationHistory(this.storage, threadId, entityName, observationId);
  }
}
