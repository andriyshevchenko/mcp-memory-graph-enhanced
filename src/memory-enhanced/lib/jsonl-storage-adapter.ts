/**
 * JSONL Storage Adapter - implements file-based storage using JSON Lines format
 */

import { promises as fs } from 'fs';
import path from 'path';
import { Entity, Relation, KnowledgeGraph } from './types.js';
import { IStorageAdapter } from './storage-interface.js';

/**
 * JSONL-based storage adapter for the knowledge graph
 * Stores data in thread-specific JSONL files
 */
export class JsonlStorageAdapter implements IStorageAdapter {
  constructor(private memoryDirPath: string) {}

  /**
   * Get the file path for a specific thread
   */
  private getThreadFilePath(agentThreadId: string): string {
    return path.join(this.memoryDirPath, `thread-${agentThreadId}.jsonl`);
  }

  /**
   * Load graph data from a single JSONL file
   */
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

  /**
   * Load the complete knowledge graph from all thread files
   */
  async loadGraph(): Promise<KnowledgeGraph> {
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

  /**
   * Save data for a specific thread
   */
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

  /**
   * Save the complete knowledge graph to thread-specific files
   */
  async saveGraph(graph: KnowledgeGraph): Promise<void> {
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

  /**
   * Initialize the storage adapter (create memory directory if needed)
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.memoryDirPath, { recursive: true });
  }
}
