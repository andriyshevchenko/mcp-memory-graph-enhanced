import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { KnowledgeGraphManager } from '../core/knowledge-graph-manager.js';
import { EntitySchema, RelationSchema } from '../core/schemas.js';

export function registerTools(server: McpServer, knowledgeGraphManager: KnowledgeGraphManager) {
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

}
