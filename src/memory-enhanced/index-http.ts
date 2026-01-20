#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ensureMemoryDirectory, KnowledgeGraphManager, EntitySchema, RelationSchema } from './index.js';

// Get port from environment variable or use default
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';

// Map to store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

let knowledgeGraphManager: KnowledgeGraphManager;

// Create server factory function
function createServer(): McpServer {
  const server = new McpServer({
    name: "memory-enhanced-server",
    version: "0.2.0",
  });

  // Register all tools (same as stdio version)
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

  return server;
}

async function main() {
  // Initialize memory directory path
  const MEMORY_DIR_PATH = await ensureMemoryDirectory();

  // Initialize knowledge graph manager with the memory directory path
  knowledgeGraphManager = new KnowledgeGraphManager(MEMORY_DIR_PATH);

  // Create Express app
  const app = createMcpExpressApp({ host: HOST });

  // MCP POST endpoint
  const mcpPostHandler = async (req: any, res: any) => {
    const sessionId = req.headers['mcp-session-id'];
    
    if (sessionId) {
      console.error(`Received MCP request for session: ${sessionId}`);
    }

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId: string) => {
            console.error(`Session initialized with ID: ${sessionId}`);
            transports[sessionId] = transport;
          }
        });

        // Set up onclose handler to clean up transport when closed
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.error(`Transport closed for session ${sid}, removing from transports map`);
            delete transports[sid];
          }
        };

        // Connect the transport to the MCP server
        const server = createServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided'
          },
          id: null
        });
        return;
      }

      // Handle the request with existing transport
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error'
          },
          id: null
        });
      }
    }
  };

  app.post('/mcp', mcpPostHandler);

  // MCP DELETE endpoint for session termination
  const mcpDeleteHandler = async (req: any, res: any) => {
    const sessionId = req.headers['mcp-session-id'];
    
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    console.error(`Received session termination request for session ${sessionId}`);

    try {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error('Error handling session termination:', error);
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  };

  app.delete('/mcp', mcpDeleteHandler);

  // Start server
  app.listen(PORT, HOST, () => {
    console.error(`Memory-Enhanced MCP HTTP Server listening on http://${HOST}:${PORT}`);
    console.error(`Endpoint: http://${HOST}:${PORT}/mcp`);
  });

  // Handle server shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down server...');
    
    // Close all active transports
    for (const sessionId in transports) {
      try {
        console.error(`Closing transport for session ${sessionId}`);
        await transports[sessionId].close();
        delete transports[sessionId];
      } catch (error) {
        console.error(`Error closing transport for session ${sessionId}:`, error);
      }
    }
    
    console.error('Server shutdown complete');
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
