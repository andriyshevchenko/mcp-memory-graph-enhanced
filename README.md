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
- `entityType`: Type of entity (free-form, any domain-specific type allowed)
- `observations`: Array of **versioned Observation objects** (not strings) - **BREAKING CHANGE**
  - Each observation has: `id`, `content`, `timestamp`, `version`, `supersedes`, `superseded_by`
  - Supports full version history tracking
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

### ⭐ Recommended Tool (New)
1. **save_memory**: **[RECOMMENDED]** Unified tool for creating entities and relations atomically with server-side validation
   - Enforces observation limits (max 150 chars, 2 sentences per observation)
   - Requires at least 1 relation per entity (prevents orphaned nodes)
   - Free-form entity types with soft normalization
   - Atomic transactions (all-or-nothing)
   - Bidirectional relation tracking
   - Quality score calculation
   - Clear, actionable error messages

### Core Operations (Legacy)
> ⚠️ **Note**: `create_entities` and `create_relations` are **deprecated**. New code should use `save_memory` for better reliability and validation.

1. **create_entities**: Create new entities with metadata (including importance) - **[DEPRECATED - Use save_memory]**
2. **create_relations**: Create relationships between entities with metadata (including importance) - **[DEPRECATED - Use save_memory]**
3. **add_observations**: Add observations to existing entities with metadata (including importance)
4. **delete_entities**: Remove entities and cascading relations
5. **delete_observations**: Remove specific observations
6. **delete_relations**: Delete relationships
7. **read_graph**: Read the entire knowledge graph
8. **search_nodes**: Search entities by name, type, or observation content
9. **open_nodes**: Retrieve specific entities by name
10. **query_nodes**: Advanced querying with range-based filtering by timestamp, confidence, and importance

### Memory Management & Insights
11. **get_analytics**: **[NEW]** Get simple, LLM-friendly analytics about your knowledge graph
    - Recent changes (last 10 entities)
    - Top important entities (by importance score)
    - Most connected entities (by relation count)
    - Orphaned entities (quality check)
12. **get_observation_history**: **[NEW]** Retrieve version history for observations
    - Track how observations evolve over time
    - View complete version chains
    - Supports rollback by viewing previous versions
13. **get_memory_stats**: Get comprehensive statistics (entity counts, thread activity, avg confidence/importance, recent activity)
14. **get_recent_changes**: Retrieve entities and relations created/modified since a specific timestamp
15. **prune_memory**: Remove old or low-importance entities to manage memory size
16. **bulk_update**: Efficiently update multiple entities at once (confidence, importance, observations)
17. **list_conversations**: List all available agent threads (conversations) with metadata including entity counts, relation counts, and activity timestamps

### Relationship Intelligence
16. **find_relation_path**: Find the shortest path of relationships between two entities (useful for "how are they connected?")
17. **get_context**: Retrieve entities and relations related to specified entities up to a certain depth

### Quality & Review
18. **detect_conflicts**: Detect potentially conflicting observations using pattern matching and negation detection
19. **flag_for_review**: Mark entities for human review with a specific reason (Human-in-the-Loop)
20. **get_flagged_entities**: Retrieve all entities flagged for review

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

#### File Storage (Default)

Set the `MEMORY_DIR_PATH` environment variable to customize the storage location:

```bash
MEMORY_DIR_PATH=/path/to/memory/directory npx mcp-server-memory-enhanced
```

#### Neo4j Storage (Optional)

The server supports Neo4j as an alternative storage backend. If Neo4j environment variables are set, the server will attempt to connect to Neo4j. If the connection fails or variables are not set, it will automatically fall back to file-based JSONL storage.

**Environment Variables:**

```bash
# Neo4j connection settings
export NEO4J_URI=neo4j://localhost:7687
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD=your_password
export NEO4J_DATABASE=neo4j  # Optional, defaults to 'neo4j'

# Run the server
npx mcp-server-memory-enhanced
```

**Using Docker Compose:**

A `docker-compose.yml` file is provided for local development with Neo4j:

```bash
# Start Neo4j and the MCP server
docker-compose up

# The Neo4j browser will be available at http://localhost:7474
# Username: neo4j, Password: testpassword
```

**Using with Claude Desktop:**

Configure the server in your Claude Desktop configuration with Neo4j:

```json
{
  "mcpServers": {
    "memory-enhanced": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory-enhanced"],
      "env": {
        "NEO4J_URI": "neo4j://localhost:7687",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "your_password"
      }
    }
  }
}
```

**Benefits of Neo4j Storage:**

- **Graph-native queries**: Faster relationship traversals and path finding
- **Scalability**: Better performance with large knowledge graphs
- **Advanced queries**: Native support for graph algorithms
- **Visualization**: Use Neo4j Browser to visualize your knowledge graph
- **Automatic fallback**: If Neo4j is not available, automatically uses file storage

## User Guide

### ✨ Using save_memory (Recommended)

The `save_memory` tool is the recommended way to create entities and relations. It provides atomic transactions and server-side validation to ensure high-quality knowledge graphs.

#### Key Principles

1. **Atomic Observations**: Each observation should be a single, atomic fact
   - ✅ Good: `"Works at Google"`, `"Lives in San Francisco"`
   - ❌ Bad: `"Works at Google and lives in San Francisco and has a PhD in Computer Science"`
   - **Max length**: 150 characters per observation
   - **Max sentences**: 2 sentences per observation (one fact = one observation is ideal)

2. **Mandatory Relations**: Every entity must connect to at least one other entity
   - ✅ Good: `{ targetEntity: "Google", relationType: "works at" }`
   - ❌ Bad: Empty relations array `[]`
   - This prevents orphaned nodes and ensures a well-connected knowledge graph

3. **Free Entity Types**: Use any entity type that makes sense for your domain
   - ✅ Good: `"Person"`, `"Company"`, `"Document"`, `"Recipe"`, `"Patient"`, `"API"`
   - Soft normalization: `"person"` → `"Person"` (warning, not error)
   - Space warning: `"API Key"` → suggests `"APIKey"`

4. **Error Messages**: The tool provides clear, actionable error messages
   - Too long: `"Observation too long (165 chars). Max 150. Suggestion: Split into multiple observations."`
   - No relations: `"Entity 'X' must have at least 1 relation. Suggestion: Add relations to show connections."`
   - Too many sentences: `"Too many sentences (3). Max 2. Suggestion: Split this into 3 separate observations."`

### Example Usage

```typescript
// ✅ RECOMMENDED: Use save_memory for atomic entity and relation creation
await save_memory({
  entities: [
    {
      name: "Alice",
      entityType: "Person",
      observations: ["Works at Google", "Lives in SF"],  // Atomic facts, under 150 chars
      relations: [{ targetEntity: "Bob", relationType: "knows" }]  // At least 1 relation required
    },
    {
      name: "Bob",
      entityType: "Person",
      observations: ["Works at Microsoft"],
      relations: [{ targetEntity: "Alice", relationType: "knows" }]
    }
  ],
  threadId: "conversation-001"
});

// Get analytics about your knowledge graph
await get_analytics({
  threadId: "conversation-001"
});
// Returns: {
//   recent_changes: [...],      // Last 10 entities
//   top_important: [...],       // Top 10 by importance
//   most_connected: [...],      // Top 10 by relation count
//   orphaned_entities: [...]    // Quality check
// }

// Get observation version history
await get_observation_history({
  entityName: "Python Scripts",
  observationId: "obs_abc123"
});
// Returns: { history: [{ id, content, version, timestamp, supersedes, superseded_by }, ...] }

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

// List all conversations (agent threads)
await listConversations();
// Returns: { conversations: [{ agentThreadId, entityCount, relationCount, firstCreated, lastUpdated }, ...] }

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

### 🔄 Migration Guide

For users of the old `create_entities` and `create_relations` tools:

#### What Changed
- **Old approach**: Two separate tools that could be used independently
  - `create_entities` → creates entities
  - `create_relations` → creates relations (optional, often skipped by LLMs)
- **New approach**: Single `save_memory` tool with atomic transactions
  - Creates entities and relations together
  - Enforces mandatory relations (at least 1 per entity)
  - Validates observation length and atomicity

#### Migrating Your Code
```typescript
// ❌ OLD WAY (deprecated but still works)
await create_entities({
  entities: [{ name: "Alice", entityType: "person", observations: ["works at Google and lives in SF"] }]
});
await create_relations({  // Often forgotten!
  relations: [{ from: "Alice", to: "Bob", relationType: "knows" }]
});

// ✅ NEW WAY (recommended)
await save_memory({
  entities: [
    {
      name: "Alice",
      entityType: "Person",
      observations: ["Works at Google", "Lives in SF"],  // Split into atomic facts
      relations: [{ targetEntity: "Bob", relationType: "knows" }]  // Required!
    }
  ],
  threadId: "conversation-001"
});
```

#### Migration Strategy
1. **Old tools remain available**: `create_entities` and `create_relations` are deprecated but not removed
2. **No forced migration**: Update your code gradually at your own pace
3. **New code should use `save_memory`**: Benefits from validation and atomic transactions
4. **Observation versioning**: New installations use versioned observations (breaking change for data model)

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
