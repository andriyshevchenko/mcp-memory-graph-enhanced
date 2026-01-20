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

### Relations
Each relation now includes:
- `from`: Source entity name
- `to`: Target entity name
- `relationType`: Type of relationship
- `agentThreadId`: Unique identifier for the agent thread
- `timestamp`: ISO 8601 timestamp of creation
- `confidence`: Confidence score (0.0 to 1.0)

## Storage Architecture

The server stores data in separate JSONL files per agent thread:
- Default location: `./memory-data/thread-{agentThreadId}.jsonl`
- Custom location: Set `MEMORY_DIR_PATH` environment variable
- Each file contains entities and relations for one agent thread
- Read operations aggregate data across all thread files

## Available Tools

1. **create_entities**: Create new entities with metadata
2. **create_relations**: Create relationships between entities with metadata
3. **add_observations**: Add observations to existing entities with metadata
4. **delete_entities**: Remove entities and cascading relations
5. **delete_observations**: Remove specific observations
6. **delete_relations**: Delete relationships
7. **read_graph**: Read the entire knowledge graph
8. **search_nodes**: Search entities by name, type, or observation content
9. **open_nodes**: Retrieve specific entities by name

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
// Create entities with metadata
await createEntities({
  entities: [
    {
      name: "Alice",
      entityType: "person",
      observations: ["works at Acme Corp"],
      agentThreadId: "thread-001",
      timestamp: "2024-01-20T10:00:00Z",
      confidence: 0.95
    }
  ]
});

// Create relations with metadata
await createRelations({
  relations: [
    {
      from: "Alice",
      to: "Bob",
      relationType: "knows",
      agentThreadId: "thread-001",
      timestamp: "2024-01-20T10:01:00Z",
      confidence: 0.9
    }
  ]
});
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
