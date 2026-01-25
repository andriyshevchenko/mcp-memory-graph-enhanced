#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import modular components
import { SaveMemoryInput, GetAnalyticsInput, GetObservationHistoryInput } from './lib/types.js';
import { KnowledgeGraphManager } from './lib/knowledge-graph-manager.js';
import { 
  EntitySchema, 
  RelationSchema, 
  SaveMemoryInputSchema, 
  SaveMemoryOutputSchema,
  GetAnalyticsInputSchema,
  GetAnalyticsOutputSchema,
  GetObservationHistoryInputSchema,
  GetObservationHistoryOutputSchema,
  ListEntitiesInputSchema,
  ListEntitiesOutputSchema,
  ValidateMemoryInputSchema,
  ValidateMemoryOutputSchema,
  UpdateObservationInputSchema,
  UpdateObservationOutputSchema,
  ReadGraphInputSchema,
  SearchNodesInputSchema,
  OpenNodesInputSchema,
  QueryNodesInputSchema,
  GetMemoryStatsInputSchema,
  GetRecentChangesInputSchema,
  FindRelationPathInputSchema,
  DetectConflictsInputSchema,
  GetFlaggedEntitiesInputSchema,
  GetContextInputSchema,
  CreateEntitiesInputSchema,
  CreateRelationsInputSchema,
  AddObservationsInputSchema,
  DeleteEntitiesInputSchema,
  DeleteObservationsInputSchema,
  DeleteRelationsInputSchema,
  PruneMemoryInputSchema,
  BulkUpdateInputSchema,
  FlagForReviewInputSchema
} from './lib/schemas.js';
import { handleSaveMemory } from './lib/save-memory-handler.js';
import { validateSaveMemoryRequest } from './lib/validation.js';
import { IStorageAdapter } from './lib/storage-interface.js';
import { JsonlStorageAdapter } from './lib/jsonl-storage-adapter.js';
import { Neo4jStorageAdapter } from './lib/neo4j-storage-adapter.js';
import { NEO4J_ENV_VARS, STORAGE_LOG_MESSAGES, NEO4J_ERROR_MESSAGES } from './lib/storage-config.js';

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

/**
 * Get Neo4j configuration from environment variables.
 * Extracted for testability and Single Responsibility Principle.
 */
function getNeo4jConfig(): { uri: string; username: string; password: string; database?: string } | null {
  const uri = process.env[NEO4J_ENV_VARS.URI];
  const username = process.env[NEO4J_ENV_VARS.USERNAME];
  const password = process.env[NEO4J_ENV_VARS.PASSWORD];
  const database = process.env[NEO4J_ENV_VARS.DATABASE];

  if (!uri || !username || !password) {
    return null;
  }

  return { uri, username, password, database };
}

/**
 * Create Neo4j storage adapter if configured.
 * Extracted for Single Responsibility Principle and testability.
 */
async function createNeo4jAdapter(config: { uri: string; username: string; password: string; database?: string }): Promise<IStorageAdapter | null> {
  try {
    console.error(STORAGE_LOG_MESSAGES.ATTEMPTING_NEO4J, config.uri);
    const neo4jAdapter = new Neo4jStorageAdapter(config);
    await neo4jAdapter.initialize();
    console.error(STORAGE_LOG_MESSAGES.NEO4J_SUCCESS);
    return neo4jAdapter;
  } catch (error) {
    // Sanitize error message to avoid exposing credentials
    const safeErrorMessage = error instanceof Error ? error.message.replace(/password[=:][\S]+/gi, 'password:***') : 'Connection failed';
    console.error(STORAGE_LOG_MESSAGES.NEO4J_FALLBACK, safeErrorMessage);
    return null;
  }
}

/**
 * Create JSONL storage adapter.
 * Extracted for DRY and testability.
 */
async function createJsonlAdapter(memoryDirPath: string): Promise<IStorageAdapter> {
  const jsonlAdapter = new JsonlStorageAdapter(memoryDirPath);
  await jsonlAdapter.initialize();
  console.error(STORAGE_LOG_MESSAGES.USING_JSONL, memoryDirPath);
  return jsonlAdapter;
}

/**
 * Create storage adapter based on environment variables.
 * Falls back to JSONL storage if Neo4j is not configured or connection fails.
 * 
 * Follows Open/Closed Principle: Open for extension (add new storage types)
 * without modifying existing code.
 */
async function createStorageAdapter(memoryDirPath: string): Promise<IStorageAdapter> {
  // Try Neo4j if configured
  const neo4jConfig = getNeo4jConfig();
  
  if (neo4jConfig) {
    const neo4jAdapter = await createNeo4jAdapter(neo4jConfig);
    if (neo4jAdapter) {
      return neo4jAdapter;
    }
  } else {
    console.error(NEO4J_ERROR_MESSAGES.NOT_CONFIGURED);
  }

  // Fall back to JSONL storage
  return createJsonlAdapter(memoryDirPath);
}

// Initialize memory directory path (will be set during startup)
let MEMORY_DIR_PATH: string;

// Re-export types for backward compatibility
export type { Entity, Relation, KnowledgeGraph } from './lib/types.js';
export { KnowledgeGraphManager } from './lib/knowledge-graph-manager.js';
export type { IStorageAdapter } from './lib/storage-interface.js';
export { JsonlStorageAdapter } from './lib/jsonl-storage-adapter.js';
export { Neo4jStorageAdapter } from './lib/neo4j-storage-adapter.js';
export type { Neo4jConfig } from './lib/neo4j-storage-adapter.js';

let knowledgeGraphManager: KnowledgeGraphManager;

// Zod schemas for enhanced entities and relations
const EntitySchemaCompat = EntitySchema;
const RelationSchemaCompat = RelationSchema;

// The server instance and tools exposed to Claude
const server = new McpServer({
  name: "memory-enhanced-server",
  version: "0.2.0",
});

// Register NEW save_memory tool (Section 1 of spec - Unified Tool)
server.registerTool(
  "save_memory",
  {
    title: "Save Memory",
    description: "Save entities and their relations to memory graph atomically. RULES: 1) Each observation max 300 chars (atomic facts, technical content supported). 2) Each entity MUST have at least 1 relation. This is the recommended way to create entities and relations.",
    inputSchema: SaveMemoryInputSchema,
    outputSchema: SaveMemoryOutputSchema
  },
  async (input: any) => {
    const result = await handleSaveMemory(
      input as SaveMemoryInput,
      (entities) => knowledgeGraphManager.createEntities(entities),
      (relations) => knowledgeGraphManager.createRelations(relations),
      (threadId) => knowledgeGraphManager.getEntityNamesInThread(threadId)
    );
    
    if (result.success) {
      // Build success message with entity names
      let successText = `✓ Successfully saved ${result.created.entities} entities and ${result.created.relations} relations.\n` +
                        `Quality score: ${(result.quality_score * 100).toFixed(1)}%\n`;
      
      if (result.created.entity_names && result.created.entity_names.length > 0) {
        successText += `\nCreated entities: ${result.created.entity_names.join(', ')}\n`;
      }
      
      if (result.warnings.length > 0) {
        successText += `\nWarnings:\n${result.warnings.join('\n')}`;
      }
      
      return {
        content: [{ 
          type: "text" as const, 
          text: successText
        }],
        structuredContent: result as any
      };
    } else {
      // Format validation errors for display
      let errorText = '✗ Validation failed:\n\n';
      
      if (result.validation_errors) {
        if (Array.isArray(result.validation_errors) && result.validation_errors.length > 0) {
          // Check if structured errors
          if (typeof result.validation_errors[0] === 'object') {
            const structuredErrors = result.validation_errors as any[];
            errorText += structuredErrors.map(err => {
              let msg = `Entity #${err.entity_index} "${err.entity_name}" (${err.entity_type}):\n`;
              err.errors.forEach((e: string) => msg += `  - ${e}\n`);
              if (err.observations && err.observations.length > 0) {
                msg += `  Observations: ${err.observations.join(', ')}\n`;
              }
              return msg;
            }).join('\n');
          } else {
            // Fallback to string errors
            errorText += result.validation_errors.join('\n');
          }
        }
      }
      
      errorText += '\nFix all validation errors and retry. All entities must be valid to maintain memory integrity.';
      
      return {
        content: [{ 
          type: "text" as const, 
          text: errorText
        }],
        structuredContent: result as any,
        isError: true
      };
    }
  }
);

server.registerTool(
  "create_entities",
  {
    title: "Create Entities",
    description: "Create multiple new entities in the knowledge graph with metadata (agent thread ID, timestamp, confidence, importance)",
    inputSchema: CreateEntitiesInputSchema,
    outputSchema: {
      entities: z.array(EntitySchemaCompat)
    }
  },
  async (input: any) => {
    const { threadId, entities } = input;
    const result = await knowledgeGraphManager.createEntities(threadId, entities);
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
    inputSchema: CreateRelationsInputSchema,
    outputSchema: {
      relations: z.array(RelationSchemaCompat)
    }
  },
  async (input: any) => {
    const { threadId, relations } = input;
    const result = await knowledgeGraphManager.createRelations(threadId, relations);
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
    inputSchema: AddObservationsInputSchema,
    outputSchema: {
      results: z.array(z.object({
        entityName: z.string(),
        addedObservations: z.array(z.string())
      }))
    }
  },
  async (input: any) => {
    const { threadId, observations } = input;
    const result = await knowledgeGraphManager.addObservations(threadId, observations);
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
    inputSchema: DeleteEntitiesInputSchema,
    outputSchema: {
      success: z.boolean(),
      message: z.string()
    }
  },
  async (input: any) => {
    const { threadId, entityNames } = input;
    await knowledgeGraphManager.deleteEntities(threadId, entityNames);
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
    inputSchema: DeleteObservationsInputSchema,
    outputSchema: {
      success: z.boolean(),
      message: z.string()
    }
  },
  async (input: any) => {
    const { threadId, deletions } = input;
    await knowledgeGraphManager.deleteObservations(threadId, deletions);
    return {
      content: [{ type: "text" as const, text: "Observations deleted successfully" }],
      structuredContent: { success: true, message: "Observations deleted successfully" }
    };
  }
);

// Register update_observation tool
server.registerTool(
  "update_observation",
  {
    title: "Update Observation",
    description: "Update an existing observation by creating a new version with updated content. This maintains version history through the supersedes/superseded_by chain.",
    inputSchema: UpdateObservationInputSchema.shape,
    outputSchema: UpdateObservationOutputSchema.shape
  },
  async ({ entityName, observationId, newContent, agentThreadId, timestamp, confidence, importance }) => {
    const updatedObservation = await knowledgeGraphManager.updateObservation({
      entityName,
      observationId,
      newContent,
      agentThreadId,
      timestamp,
      confidence,
      importance
    });
    const message = `Observation updated successfully. New version: ${updatedObservation.id} (v${updatedObservation.version})`;
    return {
      content: [{ type: "text" as const, text: message }],
      structuredContent: { 
        success: true, 
        updatedObservation, 
        message
      }
    };
  }
);

// Register delete_relations tool
server.registerTool(
  "delete_relations",
  {
    title: "Delete Relations",
    description: "Delete multiple relations from the knowledge graph",
    inputSchema: DeleteRelationsInputSchema,
    outputSchema: {
      success: z.boolean(),
      message: z.string()
    }
  },
  async (input: any) => {
    const { threadId, relations } = input;
    await knowledgeGraphManager.deleteRelations(threadId, relations);
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
    description: "Read the knowledge graph for a specific thread (thread isolation enforced)",
    inputSchema: ReadGraphInputSchema,
    outputSchema: {
      entities: z.array(EntitySchemaCompat),
      relations: z.array(RelationSchemaCompat)
    }
  },
  async (input: any) => {
    const graph = await knowledgeGraphManager.readGraph(input.threadId);
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
    description: "Search for nodes in the knowledge graph based on a query (thread isolation enforced)",
    inputSchema: SearchNodesInputSchema,
    outputSchema: {
      entities: z.array(EntitySchemaCompat),
      relations: z.array(RelationSchemaCompat)
    }
  },
  async (input: any) => {
    const graph = await knowledgeGraphManager.searchNodes(input.threadId, input.query);
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
    description: "Open specific nodes in the knowledge graph by their names (thread isolation enforced)",
    inputSchema: OpenNodesInputSchema,
    outputSchema: {
      entities: z.array(EntitySchemaCompat),
      relations: z.array(RelationSchemaCompat)
    }
  },
  async (input: any) => {
    const graph = await knowledgeGraphManager.openNodes(input.threadId, input.names);
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
    description: "Query nodes and relations in the knowledge graph with advanced filtering by timestamp, confidence, and importance ranges (thread isolation enforced)",
    inputSchema: QueryNodesInputSchema,
    outputSchema: {
      entities: z.array(EntitySchemaCompat),
      relations: z.array(RelationSchemaCompat)
    }
  },
  async (input: any) => {
    const { threadId, ...filters } = input;
    const graph = await knowledgeGraphManager.queryNodes(threadId, Object.keys(filters).length > 0 ? filters : undefined);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

// Register list_entities tool for simple entity lookup
server.registerTool(
  "list_entities",
  {
    title: "List Entities",
    description: "List entities with optional filtering by entity type and name pattern. Returns a simple list of entity names and types for quick discovery. Thread isolation enforced - only shows entities from the specified thread.",
    inputSchema: ListEntitiesInputSchema,
    outputSchema: ListEntitiesOutputSchema
  },
  async (input: any) => {
    const { threadId, entityType, namePattern } = input;
    const entities = await knowledgeGraphManager.listEntities(threadId, entityType, namePattern);
    return {
      content: [{ 
        type: "text" as const, 
        text: `Found ${entities.length} entities:\n` + 
              entities.map(e => `  - ${e.name} (${e.entityType})`).join('\n')
      }],
      structuredContent: { entities }
    };
  }
);

// Register validate_memory tool for pre-validation (dry-run)
server.registerTool(
  "validate_memory",
  {
    title: "Validate Memory",
    description: "Validate entities without saving (dry-run). Check for errors before attempting save_memory. Returns detailed validation results per entity.",
    inputSchema: ValidateMemoryInputSchema,
    outputSchema: ValidateMemoryOutputSchema
  },
  async (input: any) => {
    const { entities, threadId } = input;
    
    // Get existing entity names for cross-thread reference validation
    let existingEntityNames: Set<string> | undefined;
    try {
      existingEntityNames = await knowledgeGraphManager.getEntityNamesInThread(threadId);
    } catch (error) {
      // If we can't get existing entities, proceed without cross-thread validation
    }
    
    // Preserve original entityType values before validation normalizes them
    // This is needed to match warnings to the correct entities
    const originalEntityTypes = entities.map((e: any) => e.entityType);
    
    // Run validation (same logic as save_memory but without saving)
    const validationResult = validateSaveMemoryRequest(entities, existingEntityNames);
    
    // Transform validation result into per-entity format
    const results = new Map<number, {
      index: number;
      name: string;
      type: string;
      valid: boolean;
      errors: string[];
      warnings: string[];
    }>();
    
    // Initialize all entities as valid
    entities.forEach((entity: any, index: number) => {
      results.set(index, {
        index: index,
        name: entity.name,
        type: originalEntityTypes[index],  // Use original type, not normalized
        valid: true,
        errors: [],
        warnings: []
      });
    });
    
    // Add errors to corresponding entities
    validationResult.errors.forEach((err: any) => {
      const result = results.get(err.entityIndex);
      if (result) {
        result.valid = false;
        const errorMsg = err.suggestion 
          ? `${err.error} Suggestion: ${err.suggestion}` 
          : err.error;
        result.errors.push(errorMsg);
      }
    });
    
    // Add warnings to corresponding entities
    validationResult.warnings.forEach((warning: string) => {
      // Parse entity type from warning if possible, otherwise add to first entity
      const entityMatch = warning.match(/EntityType '([^']+)'/);
      if (entityMatch) {
        const warningEntityType = entityMatch[1];
        let attached = false;
        
        // Find entity whose ORIGINAL entityType matches the type in the warning
        // (warnings contain the original type before normalization)
        originalEntityTypes.forEach((origType: string, index: number) => {
          if (origType === warningEntityType) {
            const result = results.get(index);
            if (result) {
              result.warnings.push(warning);
              attached = true;
            }
          }
        });
        
        // If no matching entity type found, attach to first entity as fallback
        if (!attached) {
          const firstResult = results.get(0);
          if (firstResult) {
            firstResult.warnings.push(warning);
          }
        }
      } else {
        // No entity type information in warning; attach to first entity
        const firstResult = results.get(0);
        if (firstResult) {
          firstResult.warnings.push(warning);
        }
      }
    });
    
    const resultArray = Array.from(results.values());
    const allValid = resultArray.every(r => r.valid);
    
    // Format response text
    let responseText = allValid 
      ? `✓ All ${entities.length} entities are valid and ready to save.\n`
      : `✗ Validation failed for ${resultArray.filter(r => !r.valid).length} of ${entities.length} entities:\n\n`;
    
    if (!allValid) {
      resultArray.filter(r => !r.valid).forEach(r => {
        responseText += `Entity #${r.index} "${r.name}" (${r.type}):\n`;
        r.errors.forEach(e => responseText += `  - ${e}\n`);
        if (r.warnings.length > 0) {
          r.warnings.forEach(w => responseText += `  ⚠ ${w}\n`);
        }
        responseText += '\n';
      });
    }
    
    // Add warnings for valid entities if any
    const validWithWarnings = resultArray.filter(r => r.valid && r.warnings.length > 0);
    if (validWithWarnings.length > 0) {
      responseText += 'Warnings:\n';
      validWithWarnings.forEach(r => {
        responseText += `Entity #${r.index} "${r.name}" (${r.type}):\n`;
        r.warnings.forEach(w => responseText += `  ⚠ ${w}\n`);
      });
    }
    
    return {
      content: [{ 
        type: "text" as const, 
        text: responseText
      }],
      structuredContent: {
        all_valid: allValid,
        results: resultArray
      }
    };
  }
);

// Register get_memory_stats tool
server.registerTool(
  "get_memory_stats",
  {
    title: "Get Memory Statistics",
    description: "Get comprehensive statistics about the knowledge graph for a specific thread including entity counts, activity, and confidence/importance metrics (thread isolation enforced)",
    inputSchema: GetMemoryStatsInputSchema,
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
  async (input: any) => {
    const stats = await knowledgeGraphManager.getMemoryStats(input.threadId);
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
    description: "Retrieve entities and relations that were created or modified since a specific timestamp (thread isolation enforced)",
    inputSchema: GetRecentChangesInputSchema,
    outputSchema: {
      entities: z.array(EntitySchemaCompat),
      relations: z.array(RelationSchemaCompat)
    }
  },
  async (input: any) => {
    const changes = await knowledgeGraphManager.getRecentChanges(input.threadId, input.since);
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
    description: "Find a path of relationships connecting two entities in the knowledge graph (thread isolation enforced)",
    inputSchema: FindRelationPathInputSchema,
    outputSchema: {
      found: z.boolean(),
      path: z.array(z.string()),
      relations: z.array(RelationSchemaCompat)
    }
  },
  async (input: any) => {
    const result = await knowledgeGraphManager.findRelationPath(input.threadId, input.from, input.to, input.maxDepth || 5);
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
    description: "Detect potentially conflicting observations within entities using pattern matching and negation detection (thread isolation enforced)",
    inputSchema: DetectConflictsInputSchema,
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
  async (input: any) => {
    const conflicts = await knowledgeGraphManager.detectConflicts(input.threadId);
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
    inputSchema: PruneMemoryInputSchema,
    outputSchema: {
      removedEntities: z.number(),
      removedRelations: z.number()
    }
  },
  async (input: any) => {
    const { threadId, ...options } = input;
    const result = await knowledgeGraphManager.pruneMemory(threadId, options);
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
    inputSchema: BulkUpdateInputSchema,
    outputSchema: {
      updated: z.number(),
      notFound: z.array(z.string())
    }
  },
  async (input: any) => {
    const { threadId, updates } = input;
    const result = await knowledgeGraphManager.bulkUpdate(threadId, updates);
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
    inputSchema: FlagForReviewInputSchema,
    outputSchema: {
      success: z.boolean(),
      message: z.string()
    }
  },
  async (input: any) => {
    const { threadId, entityName, reason, reviewer } = input;
    await knowledgeGraphManager.flagForReview(threadId, entityName, reason, reviewer);
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
    description: "Retrieve all entities that have been flagged for human review (thread isolation enforced)",
    inputSchema: GetFlaggedEntitiesInputSchema,
    outputSchema: {
      entities: z.array(EntitySchemaCompat)
    }
  },
  async (input: any) => {
    const entities = await knowledgeGraphManager.getFlaggedEntities(input.threadId);
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
    description: "Retrieve entities and relations related to specified entities up to a certain depth, useful for understanding context around specific topics (thread isolation enforced)",
    inputSchema: GetContextInputSchema,
    outputSchema: {
      entities: z.array(EntitySchemaCompat),
      relations: z.array(RelationSchemaCompat)
    }
  },
  async (input: any) => {
    const context = await knowledgeGraphManager.getContext(input.threadId, input.entityNames, input.depth || 1);
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

// Register get_analytics tool
server.registerTool(
  "get_analytics",
  {
    title: "Get Analytics",
    description: "Get analytics for a specific thread with 4 core metrics: recent changes, top important entities, most connected entities, and orphaned entities",
    inputSchema: GetAnalyticsInputSchema,
    outputSchema: GetAnalyticsOutputSchema
  },
  async (input: GetAnalyticsInput) => {
    const result = await knowledgeGraphManager.getAnalytics(input.threadId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result as any
    };
  }
);

// Register get_observation_history tool
server.registerTool(
  "get_observation_history",
  {
    title: "Get Observation History",
    description: "Retrieve the full version chain for a specific observation, showing how it evolved over time (thread isolation enforced)",
    inputSchema: GetObservationHistoryInputSchema,
    outputSchema: GetObservationHistoryOutputSchema
  },
  async (input: any) => {
    const result = await knowledgeGraphManager.getObservationHistory(input.threadId, input.entityName, input.observationId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ history: result }, null, 2) }],
      structuredContent: { history: result } as any
    };
  }
);

async function main() {
  // Initialize memory directory path
  MEMORY_DIR_PATH = await ensureMemoryDirectory();

  // Create storage adapter based on environment variables
  // Falls back to JSONL if Neo4j is not configured or connection fails
  const storageAdapter = await createStorageAdapter(MEMORY_DIR_PATH);

  // Initialize knowledge graph manager with the storage adapter
  knowledgeGraphManager = new KnowledgeGraphManager(MEMORY_DIR_PATH, storageAdapter);

  // Register graceful shutdown handlers to ensure storage adapter is closed
  let isShuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    console.error(`Received ${signal}, shutting down gracefully...`);
    try {
      // Close storage adapter (including Neo4j connections) before exiting
      if (storageAdapter && 'close' in storageAdapter && typeof storageAdapter.close === 'function') {
        await storageAdapter.close();
      }
    } catch (err) {
      console.error("Error during storage adapter shutdown:", err);
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Enhanced Knowledge Graph MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
