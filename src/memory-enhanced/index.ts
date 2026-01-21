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
  GetObservationHistoryOutputSchema
} from './lib/schemas.js';
import { handleSaveMemory } from './lib/save-memory-handler.js';

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

// Re-export types for backward compatibility
export type { Entity, Relation, KnowledgeGraph } from './lib/types.js';
export { KnowledgeGraphManager } from './lib/knowledge-graph-manager.js';
export type { IStorageAdapter } from './lib/storage-interface.js';
export { JsonlStorageAdapter } from './lib/jsonl-storage-adapter.js';

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
    description: "Save entities and their relations to memory graph atomically. RULES: 1) Each observation max 150 chars (atomic facts only). 2) Each entity MUST have at least 1 relation. This is the recommended way to create entities and relations.",
    inputSchema: SaveMemoryInputSchema,
    outputSchema: SaveMemoryOutputSchema
  },
  async (input: any) => {
    const result = await handleSaveMemory(
      input as SaveMemoryInput,
      (entities) => knowledgeGraphManager.createEntities(entities),
      (relations) => knowledgeGraphManager.createRelations(relations)
    );
    
    if (result.success) {
      return {
        content: [{ 
          type: "text" as const, 
          text: `✓ Successfully saved ${result.created.entities} entities and ${result.created.relations} relations.\n` +
                `Quality score: ${(result.quality_score * 100).toFixed(1)}%\n` +
                (result.warnings.length > 0 ? `\nWarnings:\n${result.warnings.join('\n')}` : '')
        }],
        structuredContent: result as any
      };
    } else {
      return {
        content: [{ 
          type: "text" as const, 
          text: `✗ Validation failed:\n${result.validation_errors?.join('\n')}` 
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
    inputSchema: {
      entities: z.array(EntitySchemaCompat)
    },
    outputSchema: {
      entities: z.array(EntitySchemaCompat)
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
      relations: z.array(RelationSchemaCompat)
    },
    outputSchema: {
      relations: z.array(RelationSchemaCompat)
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
      relations: z.array(RelationSchemaCompat).describe("An array of relations to delete")
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
      entities: z.array(EntitySchemaCompat),
      relations: z.array(RelationSchemaCompat)
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
      entities: z.array(EntitySchemaCompat),
      relations: z.array(RelationSchemaCompat)
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
      entities: z.array(EntitySchemaCompat),
      relations: z.array(RelationSchemaCompat)
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
      entities: z.array(EntitySchemaCompat),
      relations: z.array(RelationSchemaCompat)
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
      entities: z.array(EntitySchemaCompat),
      relations: z.array(RelationSchemaCompat)
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
      relations: z.array(RelationSchemaCompat)
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
      entities: z.array(EntitySchemaCompat)
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
      entities: z.array(EntitySchemaCompat),
      relations: z.array(RelationSchemaCompat)
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
    description: "Retrieve the full version chain for a specific observation, showing how it evolved over time",
    inputSchema: GetObservationHistoryInputSchema,
    outputSchema: GetObservationHistoryOutputSchema
  },
  async (input: GetObservationHistoryInput) => {
    const result = await knowledgeGraphManager.getObservationHistory(input.entityName, input.observationId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ history: result }, null, 2) }],
      structuredContent: { history: result } as any
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
