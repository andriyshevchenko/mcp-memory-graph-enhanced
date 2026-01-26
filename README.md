# Atomic Memory MCP Server

> **Persistent memory for long conversations** - Never lose context across multiple Claude chats or Copilot sessions

A Model Context Protocol (MCP) server that provides persistent memory management for AI conversations through a knowledge graph. Designed to solve the context loss problem in very long conversations by enabling **atomic memory snapshots** that can be shared across multiple agents and chat sessions.

## 🎯 The Problem

Long conversations with AI assistants face a fundamental challenge:
- **Context window limits** - Models have finite context lengths
- **Context loss** - Important information gets lost as conversations grow
- **No persistence** - Each new chat starts from scratch
- **No cross-chat memory** - Can't share knowledge between different conversations

## ✨ The Solution

Atomic Memory MCP Server provides:

1. **Persistent Knowledge Graph** - Store facts as atomic entities and relations
2. **Cross-Session Memory** - Access the same memory from multiple Claude chats or agents
3. **Atomic Facts** - Each observation is as atomic as possible (max 300 chars, ideally 1-3 sentences)
4. **Context Restoration** - Quickly restore relevant context from past conversations
5. **Delegation-Friendly** - Seamlessly hand off tasks to other agents with full context

### How It Works

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Chat 1       │      │   Chat 2      │      │   Chat 3       │
│  Main Task     │      │  Supabase     │      │  Frontend      │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                        │                       │
       │     Save Facts         │     Read Context      │
       └────────────────────┼────────────────────┘
                                │
                    ┌───────▼────────┐
                    │  Memory Graph.     │
                    │   (Neo4j or        │
                    │     JSONL)         │
                    └────────────────┘
```

**Example Workflow:**
1. **Chat 1 (Main)**: "Set up authentication for our app"
   - Saves facts: Project uses Supabase, needs email auth, etc.
2. **Chat 2 (Delegate)**: "Set up Supabase"
   - Reads memory: Learns about project context
   - Completes task: Sets up Supabase with email auth
   - Saves results: Connection strings, schema details
3. **Chat 1 (Main)**: Continues with full context of what was set up

## 🚀 Installation

### For Claude Desktop

Add to your Claude Desktop configuration file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": [
        "-y",
        "server-memory-enhanced"
      ],
      "env": {
        "MEMORY_DIR_PATH": "/absolute/path/to/memory-data"
      }
    }
  }
}
```

### For VSCode with Copilot

Create or update `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "memory": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "server-memory-enhanced"],
      "env": {
        "MEMORY_DIR_PATH": "./memory-data"
      }
    }
  }
}
```

### With Neo4j (Optional)

For better performance and visualization on large knowledge graphs:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "server-memory-enhanced"],
      "env": {
        "NEO4J_URI": "neo4j://localhost:7687",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "your-password",
        "NEO4J_DATABASE": "neo4j"
      }
    }
  }
}
```

**Quick Neo4j Setup with Docker:**
```bash
git clone https://github.com/andriyshevchenko/atomic-memory-mcp
cd atomic-memory-mcp
docker-compose up
```

Access Neo4j Browser at http://localhost:7474 to visualize your knowledge graph.

### Typical Workflow

#### 1. Regular Snapshots During Work

**Prompt to use regularly:**
```
Capture a 100% comprehensive snapshot of current conversation state to memory.
Include key decisions, configurations, and important context we've discussed.
Validate memory first. Don't store all at once, apply incremental updates
```

#### 2. Restoring Context in New Chat

**Prompt for new agent/chat:**
```
Restore full context for thread "linkedin-outreach-mvp" using memory tools.
Next proceed with [specific task].
```

#### 3. Delegating Tasks

**In Main Chat:**
```
I'm going to delegate setting up Supabase to another agent. 
Please save all relevant context about our authentication requirements,
database schema plans, and project structure to memory.
```

**In Delegated Chat:**
```
I've been delegated to set up Supabase. Please read the memory to understand:
- Project requirements
- Authentication needs
- Database schema
- Any other relevant context

Then help me set up Supabase accordingly.
```

### Prompt Examples

#### Example 1: Starting a New Project
```
We're starting a new e-commerce project called "ShopFast".
Please save this information to memory:
- Project: ShopFast e-commerce platform
- Tech stack: Next.js 14, TypeScript, Tailwind CSS
- Backend: Supabase (PostgreSQL + Auth)
- Payment: Stripe integration
- Hosting: Vercel
```

#### Example 2: After Making Progress
```
We just completed the authentication setup. Please snapshot to memory:
- Implemented email/password auth with Supabase
- Added Google OAuth provider
- Created user profiles table with schema: id, email, name, avatar_url
- Set up Row Level Security policies
- Auth working in dev environment
```

#### Example 3: Before Delegating
```
I need to delegate the payment integration to another agent.
Save to memory:
- We're using Stripe for payments
- Need to support one-time purchases and subscriptions
- Product prices: Basic ($9.99/mo), Pro ($29.99/mo), Enterprise (custom)
- Webhook endpoint should be /api/webhooks/stripe
- Test mode keys are in .env.local
```

#### Example 4: Checking What's Done
```
What progress have we made on the ShopFast project? 
Please search memory for:
- Completed features
- Current status of authentication, payment, and frontend
- Any pending issues or TODOs
```

## 🔧 Available APIs

### 🌟 Recommended Tools

#### `save_memory` ⭐ **RECOMMENDED**
Atomically save entities and relations with full validation.

```typescript
// Example: Save project setup information
{
  "entities": [
    {
      "name": "ShopFast",
      "entityType": "Project",
      "observations": ["E-commerce platform for fast checkout"]
    },
    {
      "name": "Next.js 14",
      "entityType": "Framework",
      "observations": ["Frontend framework with App Router"]
    }
  ],
  "relations": [
    {
      "from": "ShopFast",
      "to": "Next.js 14",
      "relationType": "uses"
    }
  ]
}
```

#### `read_graph`
Read the entire knowledge graph or filter by thread.

```typescript
{
  "agentThreadId": "optional-thread-id"
}
```

#### `search_nodes`
Search entities by name, type, or observation content.

```typescript
{
  "query": "authentication",
  "agentThreadId": "optional-thread-id"
}
```

#### `get_context`
Get all entities and relations related to specific entities.

```typescript
{
  "entityNames": ["ShopFast", "Authentication"],
  "agentThreadId": "optional-thread-id"
}
```

### Analytics Tools

#### `get_analytics`
Get insights about your knowledge graph.

```typescript
{
  "agentThreadId": "optional-thread-id"
}
```

Returns:
- Recent changes (last 10 entities)
- Most important entities (top 10)
- Most connected entities (top 10)
- Orphaned entities (quality check)

#### `get_memory_stats`
Comprehensive statistics about the memory graph.

#### `list_conversations`
List all available conversations/threads with metadata.

### Advanced Tools

#### `get_observation_history`
Track version history of observations.

#### `update_observation`
Update an observation while preserving version history.

#### `find_relation_path`
Find the shortest path between two entities.

#### `detect_conflicts`
Detect potentially conflicting observations.

#### `open_nodes`
Retrieve specific entities by name.

#### `query_nodes`
Advanced filtering with importance/confidence ranges.

#### `get_recent_changes`
Get entities/relations modified since a timestamp.

### Maintenance Tools

#### `prune_memory`
Remove old or low-importance entities.

#### `bulk_update`
Efficiently update multiple entities at once.

#### `flag_for_review`
Mark entities for human review.

#### `get_flagged_entities`
Retrieve entities flagged for review.

### Legacy Tools (Deprecated)

These tools still work but `save_memory` is recommended:
- `create_entities` - Use `save_memory` instead
- `create_relations` - Use `save_memory` instead
- `add_observations`
- `delete_entities`
- `delete_observations`
- `delete_relations`

## 🎨 Multi-Agent Delegation Flow

The real power of Atomic Memory MCP is enabling seamless work across dozens of agents:

```
                         ┌──────────────────┐
                         │   Main Project.     │
                         │   Coordination      │
                         └────────┬─────────┘
                                    │
                    ┌─────────────┼─────────────┐
                    │                │               │
            ┌───────▼──────┐ ┌───▼─────┐ ┌────▼──────┐
            │   Backend       │ │Frontend.  │ │   DevOps     │
            │    Agent        │ │  Agent.   │ │   Agent      │
            └───────┬──────┘ └───┬─────┘ └────┬──────┘
                      │              │              │
         ┌──────────┼────────────┼────────────┼──────────┐
         │            │              │               │           │
    ┌────▼───┐ ┌───▼────┐  ┌───▼────┐  ┌───▼────┐ ┌───▼────┐
    │Database. | │  API     │  │  UI      │   │ Docker   │ │   CI     │
    │ Agent    │ │ Agent    │  │ Agent    │   │ Agent    │ │ Agent    │
    └────┬───┘ └───┬────┘  └───┬────┘    └───┬────┘ └───┬────
          │           │             │              │            │
          └─────────┴───────────┴───────────┴──────────┘
                                 │
                    ┌─────────▼──────────┐
                    │   Shared Memory        │
                    │   Knowledge Graph      │
                    └────────────────────┘
```

**Use Cases Beyond Code:**
- **Writing**: Multiple agents working on different book chapters
- **Research**: Agents exploring different topics, sharing findings
- **Planning**: Break down complex projects across specialist agents
- **Learning**: Agents teaching different concepts, building on each other
- **Creative**: Collaborative story writing, game design, etc.

Each agent can:
1. ✅ Read full context from shared memory
2. ✅ Complete its specialized task
3. ✅ Save results back to memory
4. ✅ Enable other agents to build on its work

## 🧪 Data Model

### Entity
- `name`: Unique identifier (string, 1-100 chars)
- `entityType`: Free-form type (string, 1-50 chars, e.g., "Project", "API", "Database")
- `observations`: Array of Observation objects
- `confidence`: Float 0.0-1.0 (default: 0.8)
- `importance`: Float 0.0-1.0 (default: 0.5)
- `timestamp`: ISO 8601 creation timestamp
- `agentThreadId`: Thread/conversation identifier

### Relation
- `from`: Source entity name
- `to`: Target entity name
- `relationType`: Relationship type (e.g., "uses", "depends_on", "implements")
- `confidence`: Float 0.0-1.0
- `timestamp`: ISO 8601 timestamp
- `agentThreadId`: Thread identifier

### Observation
- `id`: Unique identifier
- `content`: The actual fact (string, 5-300 chars, max 3 sentences)
- `timestamp`: ISO 8601 timestamp
- `version`: Version number (starts at 1)
- `supersedes`: ID of observation this replaces (optional)
- `superseded_by`: ID of observation that replaces this (optional)
- `confidence`: Float 0.0-1.0 (inherited from entity if not set)
- `importance`: Float 0.0-1.0 (inherited from entity if not set)
- `agentThreadId`: Thread identifier

## 🛠️ Development

### Build
```bash
npm install
npm run build
```

### Test
```bash
cd src/memory-enhanced
npm test
```

### Run Locally
```bash
npm run build
cd src/memory-enhanced
node dist/index.js
```

## 📊 Storage Backends

### JSONL (Default)
- Simple file-based storage
- One file per conversation thread
- No additional setup required
- Great for personal use and small to medium graphs

### Neo4j (Optional)
- Graph database with powerful query capabilities
- Visual knowledge graph exploration via Neo4j Browser
- Better performance for large graphs
- Advanced graph algorithms
- Requires Neo4j instance (Docker Compose included)

## 🔒 Security

- All credentials via environment variables
- No hardcoded secrets
- Proper error handling
- Input validation with hard limits
- CodeQL security scanning: 0 alerts

## 📝 Best Practices

1. **Keep observations atomic** - One fact per observation, max 300 chars
2. **Use descriptive entity types** - "APIEndpoint", "DatabaseTable", "Configuration"
3. **Regular snapshots** - Save context every 10-20 messages in long conversations
4. **Thread naming** - Use meaningful thread IDs for different projects/topics
5. **Context restoration** - Always read memory when starting a delegated task
6. **Confidence scores** - Use lower confidence (0.3-0.6) for assumptions, higher (0.8-1.0) for facts
7. **Importance scores** - Mark critical information as high importance (0.8-1.0)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🔗 Links

- [Model Context Protocol](https://modelcontextprotocol.io)
- [GitHub Repository](https://github.com/andriyshevchenko/atomic-memory-mcp)
- [Issue Tracker](https://github.com/andriyshevchenko/atomic-memory-mcp/issues)

## 🙏 Acknowledgments

Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk) by Anthropic.

---

**Happy memory making! 🧠✨**
