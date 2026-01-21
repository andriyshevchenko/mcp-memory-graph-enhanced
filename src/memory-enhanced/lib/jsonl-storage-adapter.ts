/**
 * JSONL Storage Adapter - implements file-based storage using JSON Lines format
 */

import { promises as fs } from 'fs';
import path from 'path';
import { Entity, Relation, KnowledgeGraph } from './types.js';
import { IStorageAdapter } from './storage-interface.js';

// Constants for file naming and types
const THREAD_FILE_PREFIX = 'thread-';
const THREAD_FILE_EXTENSION = '.jsonl';
const ENTITY_TYPE = 'entity';
const RELATION_TYPE = 'relation';
const FILE_NOT_FOUND_ERROR = 'ENOENT';

/**
 * Represents a file system error with a code property
 */
interface FileSystemError extends Error {
  code: string;
}

/**
 * Type guard to check if an error is a FileSystemError
 */
function isFileSystemError(error: unknown): error is FileSystemError {
  return error instanceof Error && 'code' in error;
}

/**
 * Check if a string field is valid (non-empty after trimming)
 */
function isValidString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Represents thread-specific data
 */
interface ThreadData {
  entities: Entity[];
  relations: Relation[];
}

/**
 * Represents a serialized item in JSONL format
 */
interface JsonlItem {
  type: string;
  [key: string]: any;
}

/**
 * JSONL-based storage adapter for the knowledge graph
 * Stores data in thread-specific JSONL files
 * 
 * Responsibilities:
 * - File I/O operations for JSONL format
 * - Thread-based data organization
 * - Data serialization/deserialization
 */
export class JsonlStorageAdapter implements IStorageAdapter {
  constructor(private readonly memoryDirPath: string) {}

  /**
   * Get the file path for a specific thread
   */
  private getThreadFilePath(agentThreadId: string): string {
    return path.join(this.memoryDirPath, `${THREAD_FILE_PREFIX}${agentThreadId}${THREAD_FILE_EXTENSION}`);
  }

  /**
   * Check if an item is a valid entity
   */
  private isValidEntity(item: JsonlItem): boolean {
    return item.type === ENTITY_TYPE &&
           isValidString(item.name) &&
           isValidString(item.entityType) &&
           Array.isArray(item.observations) &&
           isValidString(item.agentThreadId) &&
           isValidString(item.timestamp) &&
           typeof item.confidence === 'number' &&
           typeof item.importance === 'number';
  }

  /**
   * Check if an item is a valid relation
   */
  private isValidRelation(item: JsonlItem): boolean {
    return item.type === RELATION_TYPE &&
           isValidString(item.from) &&
           isValidString(item.to) &&
           isValidString(item.relationType) &&
           isValidString(item.agentThreadId) &&
           isValidString(item.timestamp) &&
           typeof item.confidence === 'number' &&
           typeof item.importance === 'number';
  }

  /**
   * Parse and validate a single JSONL line
   */
  private parseLine(line: string, filePath: string): JsonlItem | null {
    try {
      return JSON.parse(line);
    } catch (parseError) {
      console.warn(`Skipping malformed JSON line in ${filePath} (line length: ${line.length} chars)`);
      return null;
    }
  }

  /**
   * Convert JSONL item to Entity
   */
  private toEntity(item: JsonlItem): Entity {
    return {
      name: item.name,
      entityType: item.entityType,
      observations: item.observations,
      agentThreadId: item.agentThreadId,
      timestamp: item.timestamp,
      confidence: item.confidence,
      importance: item.importance
    };
  }

  /**
   * Convert JSONL item to Relation
   */
  private toRelation(item: JsonlItem): Relation {
    return {
      from: item.from,
      to: item.to,
      relationType: item.relationType,
      agentThreadId: item.agentThreadId,
      timestamp: item.timestamp,
      confidence: item.confidence,
      importance: item.importance
    };
  }

  /**
   * Process a single JSONL item and add to graph
   */
  private processItem(item: JsonlItem | null, graph: KnowledgeGraph, filePath: string): void {
    if (!item) {
      return;
    }

    if (this.isValidEntity(item)) {
      graph.entities.push(this.toEntity(item));
    } else if (this.isValidRelation(item)) {
      graph.relations.push(this.toRelation(item));
    } else if (item.type === ENTITY_TYPE || item.type === RELATION_TYPE) {
      console.warn(`Skipping ${item.type} with missing required fields in ${filePath}`);
    }
  }

  /**
   * Serialize an entity to JSONL format
   */
  private serializeEntity(entity: Entity): string {
    return JSON.stringify({
      type: ENTITY_TYPE,
      name: entity.name,
      entityType: entity.entityType,
      observations: entity.observations,
      agentThreadId: entity.agentThreadId,
      timestamp: entity.timestamp,
      confidence: entity.confidence,
      importance: entity.importance
    });
  }

  /**
   * Serialize a relation to JSONL format
   */
  private serializeRelation(relation: Relation): string {
    return JSON.stringify({
      type: RELATION_TYPE,
      from: relation.from,
      to: relation.to,
      relationType: relation.relationType,
      agentThreadId: relation.agentThreadId,
      timestamp: relation.timestamp,
      confidence: relation.confidence,
      importance: relation.importance
    });
  }

  /**
   * Get or create thread data in the map
   */
  private getOrCreateThreadData(threadMap: Map<string, ThreadData>, threadId: string): ThreadData {
    let threadData = threadMap.get(threadId);
    if (!threadData) {
      threadData = { entities: [], relations: [] };
      threadMap.set(threadId, threadData);
    }
    return threadData;
  }

  /**
   * Check if error is a file not found error
   */
  private isFileNotFoundError(error: unknown): boolean {
    return isFileSystemError(error) && error.code === FILE_NOT_FOUND_ERROR;
  }

  /**
   * Extract thread ID from filename
   */
  private extractThreadId(fileName: string): string | null {
    const match = fileName.match(new RegExp(`^${THREAD_FILE_PREFIX}(.+)${THREAD_FILE_EXTENSION}$`));
    return match ? match[1] : null;
  }

  /**
   * Load graph data from a single JSONL file
   */
  private async loadGraphFromFile(filePath: string): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(filePath, "utf-8");
      const lines = data.split("\n").filter(line => line.trim() !== "");
      const graph: KnowledgeGraph = { entities: [], relations: [] };

      for (const line of lines) {
        const item = this.parseLine(line, filePath);
        this.processItem(item, graph, filePath);
      }

      return graph;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  /**
   * Get all thread file names in the memory directory
   */
  private async getThreadFileNames(): Promise<string[]> {
    const files = await fs.readdir(this.memoryDirPath).catch(() => []);
    return files.filter(f => f.startsWith(THREAD_FILE_PREFIX) && f.endsWith(THREAD_FILE_EXTENSION));
  }

  /**
   * Merge multiple graphs into one
   */
  private mergeGraphs(graphs: KnowledgeGraph[]): KnowledgeGraph {
    return graphs.reduce((acc: KnowledgeGraph, graph: KnowledgeGraph) => ({
      entities: [...acc.entities, ...graph.entities],
      relations: [...acc.relations, ...graph.relations]
    }), { entities: [], relations: [] });
  }

  /**
   * Load the complete knowledge graph from all thread files
   */
  async loadGraph(): Promise<KnowledgeGraph> {
    const threadFiles = await this.getThreadFileNames();
    const graphs = await Promise.all(
      threadFiles.map(f => this.loadGraphFromFile(path.join(this.memoryDirPath, f)))
    );
    return this.mergeGraphs(graphs);
  }

  /**
   * Delete empty thread file if it exists
   */
  private async deleteThreadFileIfExists(threadFilePath: string): Promise<void> {
    try {
      await fs.unlink(threadFilePath);
    } catch (error) {
      if (!this.isFileNotFoundError(error)) {
        console.warn(`Failed to delete empty thread file ${threadFilePath}:`, error);
      }
    }
  }

  /**
   * Serialize thread data to JSONL lines
   */
  private serializeThreadData(threadData: ThreadData): string[] {
    return [
      ...threadData.entities.map(e => this.serializeEntity(e)),
      ...threadData.relations.map(r => this.serializeRelation(r))
    ];
  }

  /**
   * Save data for a specific thread
   */
  private async saveGraphForThread(agentThreadId: string, threadData: ThreadData): Promise<void> {
    const threadFilePath = this.getThreadFilePath(agentThreadId);
    const lines = this.serializeThreadData(threadData);
    
    if (lines.length === 0) {
      await this.deleteThreadFileIfExists(threadFilePath);
      return;
    }
    
    await fs.writeFile(threadFilePath, lines.join("\n"));
  }

  /**
   * Group graph data by thread ID
   */
  private groupByThread(graph: KnowledgeGraph): Map<string, ThreadData> {
    const threadMap = new Map<string, ThreadData>();
    
    for (const entity of graph.entities) {
      const threadData = this.getOrCreateThreadData(threadMap, entity.agentThreadId);
      threadData.entities.push(entity);
    }
    
    for (const relation of graph.relations) {
      const threadData = this.getOrCreateThreadData(threadMap, relation.agentThreadId);
      threadData.relations.push(relation);
    }
    
    return threadMap;
  }

  /**
   * Save all thread data to their respective files
   */
  private async saveAllThreads(threadMap: Map<string, ThreadData>): Promise<void> {
    const savePromises = Array.from(threadMap.entries()).map(([threadId, data]) => 
      this.saveGraphForThread(threadId, data)
    );
    await Promise.all(savePromises);
  }

  /**
   * Clean up stale thread files that are no longer in the graph
   */
  private async cleanupStaleThreadFiles(activeThreadIds: Set<string>): Promise<void> {
    try {
      const threadFiles = await this.getThreadFileNames();
      
      const deletePromises = threadFiles.map(async (fileName) => {
        const threadId = this.extractThreadId(fileName);
        if (threadId && !activeThreadIds.has(threadId)) {
          const filePath = path.join(this.memoryDirPath, fileName);
          await this.deleteThreadFileIfExists(filePath);
        }
      });
      
      await Promise.all(deletePromises);
    } catch (error) {
      console.warn('Failed to clean up stale thread files:', error);
    }
  }

  /**
   * Save the complete knowledge graph to thread-specific files
   */
  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    const threadMap = this.groupByThread(graph);
    await this.saveAllThreads(threadMap);
    await this.cleanupStaleThreadFiles(new Set(threadMap.keys()));
  }

  /**
   * Initialize the storage adapter (create memory directory if needed)
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.memoryDirPath, { recursive: true });
  }
}
