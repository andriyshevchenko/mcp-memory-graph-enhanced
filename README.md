# Memory-Enhanced MCP Server

An enhanced version of the Memory MCP server that provides persistent knowledge graph storage with agent threading, timestamps, and confidence scoring.

## Features

- **Agent Thread Isolation**: Each agent thread writes to a separate file for better organization and parallel processing
- **Timestamp Tracking**: Every entity and relation has an ISO 8601 timestamp indicating when it was created
- **Confidence Scoring**: Each piece of knowledge has a confidence coefficient (0.0 to 1.0) representing certainty
- **Persistent Storage**: Knowledge graphs are stored in JSONL format, one file per agent thread
- **Graph Operations**: Full CRUD support for entities, relations, and observations

## Enhanced Data Model

### Entities
Each entity now includes:
- `name`: Entity identifier
- `entityType`: Type of entity
- `observations`: Array of observation strings
- `agentThreadId`: Unique identifier for the agent thread
- `timestamp`: ISO 8601 timestamp of creation
- `confidence`: Confidence score (0.0 to 1.0)
- `importance`: Importance for memory integrity if lost (0.0 = not important, 1.0 = critical)

### Relations
Each relation now includes:
- `from`: Source entity name
- `to`: Target entity name
- `relationType`: Type of relationship
- `agentThreadId`: Unique identifier for the agent thread
- `timestamp`: ISO 8601 timestamp of creation
- `confidence`: Confidence score (0.0 to 1.0)
- `importance`: Importance for memory integrity if lost (0.0 = not important, 1.0 = critical)

## Storage Architecture

The server implements a **collaborative knowledge graph** where multiple agent threads contribute to a shared graph:

### Design Principles
- **Shared Entities**: Entity names are globally unique across all threads. If entity "Alice" exists, all threads reference the same entity.
- **Shared Relations**: Relations are unique by (from, to, relationType) across all threads.
- **Metadata Tracking**: Each entity and relation tracks which agent thread created it via `agentThreadId`, along with `timestamp` and `confidence`.
- **Distributed Storage**: Data is physically stored in separate JSONL files per thread for organization and performance.
- **Aggregated Reads**: Read operations combine data from all thread files to provide a complete view of the knowledge graph.

### File Organization
The server stores data in separate JSONL files per agent thread:
- Default location: `./memory-data/thread-{agentThreadId}.jsonl`
- Custom location: Set `MEMORY_DIR_PATH` environment variable
- Each file contains entities and relations for one agent thread
- Read operations aggregate data across all thread files

## Available Tools

### Core Operations
1. **create_entities**: Create new entities with metadata (including importance)
2. **create_relations**: Create relationships between entities with metadata (including importance)
3. **add_observations**: Add observations to existing entities with metadata (including importance)
4. **delete_entities**: Remove entities and cascading relations
5. **delete_observations**: Remove specific observations
6. **delete_relations**: Delete relationships
7. **read_graph**: Read the entire knowledge graph
8. **search_nodes**: Search entities by name, type, or observation content
9. **open_nodes**: Retrieve specific entities by name
10. **query_nodes**: Advanced querying with range-based filtering by timestamp, confidence, and importance

### Memory Management & Insights
11. **get_memory_stats**: Get comprehensive statistics (entity counts, thread activity, avg confidence/importance, recent activity)
12. **get_recent_changes**: Retrieve entities and relations created/modified since a specific timestamp
13. **prune_memory**: Remove old or low-importance entities to manage memory size
14. **bulk_update**: Efficiently update multiple entities at once (confidence, importance, observations)

### Relationship Intelligence
15. **find_relation_path**: Find the shortest path of relationships between two entities (useful for "how are they connected?")
16. **get_context**: Retrieve entities and relations related to specified entities up to a certain depth

### Quality & Review
17. **detect_conflicts**: Detect potentially conflicting observations using pattern matching and negation detection
18. **flag_for_review**: Mark entities for human review with a specific reason (Human-in-the-Loop)
19. **get_flagged_entities**: Retrieve all entities flagged for review

## Usage

### Installation

```bash
npm install @modelcontextprotocol/server-memory-enhanced
```

### Running the Server

```bash
npx mcp-server-memory-enhanced
```

### Configuration

Set the `MEMORY_DIR_PATH` environment variable to customize the storage location:

```bash
MEMORY_DIR_PATH=/path/to/memory/directory npx mcp-server-memory-enhanced
```

## Example

```typescript
// Create entities with metadata including importance
await createEntities({
  entities: [
    {
      name: "Alice",
      entityType: "person",
      observations: ["works at Acme Corp"],
      agentThreadId: "thread-001",
      timestamp: "2024-01-20T10:00:00Z",
      confidence: 0.95,
      importance: 0.9  // Critical entity
    }
  ]
});

// Create relations with metadata including importance
await createRelations({
  relations: [
    {
      from: "Alice",
      to: "Bob",
      relationType: "knows",
      agentThreadId: "thread-001",
      timestamp: "2024-01-20T10:01:00Z",
      confidence: 0.9,
      importance: 0.75  // Important relationship
    }
  ]
});

// Query nodes with range-based filtering
await queryNodes({
  timestampStart: "2024-01-20T09:00:00Z",
  timestampEnd: "2024-01-20T11:00:00Z",
  confidenceMin: 0.8,
  importanceMin: 0.7  // Only get important items
});

// Get memory statistics
await getMemoryStats();
// Returns: { entityCount, relationCount, threadCount, entityTypes, avgConfidence, avgImportance, recentActivity }

// Get recent changes since last interaction
await getRecentChanges({ since: "2024-01-20T10:00:00Z" });

// Find how two entities are connected
await findRelationPath({ from: "Alice", to: "Charlie", maxDepth: 5 });

// Get context around specific entities
await getContext({ entityNames: ["Alice", "Bob"], depth: 2 });

// Detect conflicting observations
await detectConflicts();

// Flag entity for human review
await flagForReview({ entityName: "Alice", reason: "Uncertain data", reviewer: "John" });

// Bulk update multiple entities
await bulkUpdate({
  updates: [
    { entityName: "Alice", importance: 0.95 },
    { entityName: "Bob", confidence: 0.85, addObservations: ["updated info"] }
  ]
});

// Prune old/unimportant data
await pruneMemory({ olderThan: "2024-01-01T00:00:00Z", importanceLessThan: 0.3, keepMinEntities: 100 });
```

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm run test
```

### Watch Mode

```bash
npm run watch
```

## License

MIT

## 🚀 Getting Started

### Installation

```bash
npm install @modelcontextprotocol/server-memory-enhanced
```

### Running the Server

```bash
npx @modelcontextprotocol/server-memory-enhanced
```

### Configuration

Set the `MEMORY_DIR_PATH` environment variable to customize the storage location:

```bash
MEMORY_DIR_PATH=/path/to/memory/directory npx @modelcontextprotocol/server-memory-enhanced
```

### Using with Claude Desktop

Configure the server in your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "memory-enhanced": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory-enhanced"]
    }
  }
}
```

## 🛠️ Development

### Build

```bash
npm run build
```

### Test

```bash
npm run test
```

### Watch Mode

```bash
npm run watch
```

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 🔒 Security

See [SECURITY.MD](SECURITY.md) for reporting security vulnerabilities.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 💬 Community

- [GitHub Discussions](https://github.com/modelcontextprotocol/servers/discussions)
- [Model Context Protocol Documentation](https://modelcontextprotocol.io)

---

Part of the [Model Context Protocol](https://modelcontextprotocol.io) project.
