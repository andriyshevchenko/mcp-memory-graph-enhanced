#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ensureMemoryDirectory } from './core/config.js';
import { KnowledgeGraphManager } from './core/knowledge-graph-manager.js';
import { registerTools } from './tools/register-tools.js';

// Re-export types for backward compatibility with tests
export { Entity, Relation, KnowledgeGraph, Observation } from './core/types.js';
export { KnowledgeGraphManager } from './core/knowledge-graph-manager.js';
export { ensureMemoryDirectory, defaultMemoryDir } from './core/config.js';

// The server instance
const server = new McpServer({
  name: "memory-enhanced-server",
  version: "1.0.0",
});

// Initialize knowledge graph manager (will be set during startup)
let knowledgeGraphManager: KnowledgeGraphManager;

async function main() {
  // Initialize memory directory path
  const MEMORY_DIR_PATH = await ensureMemoryDirectory();

  // Initialize knowledge graph manager with the memory directory path
  knowledgeGraphManager = new KnowledgeGraphManager(MEMORY_DIR_PATH);

  // Register all tools
  registerTools(server, knowledgeGraphManager);

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Enhanced Knowledge Graph MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
