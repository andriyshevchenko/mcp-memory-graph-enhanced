# MCP Memory Server - Improvements Specification

**Date:** January 20, 2026  
**Author:** Andrii  
**Project:** MCP Memory Server Enhancement

---

## 🎯 Executive Summary

This document outlines agreed-upon improvements to the MCP Memory Server to address reliability issues with LLM-based agents. The core problem: **LLMs cannot be trusted to follow strict multi-step algorithms**, even with detailed prompts.

**Solution:** Move validation and workflow enforcement from prompts to the tool layer.

---

## ❌ Core Problems Identified

1. **LLMs frequently skip steps** despite detailed instructions
2. Users forget to make observations **atomic** (one fact per observation)
3. Users forget to create **relations** between entities
4. **Prompts are insufficient** for guaranteed data quality in knowledge graphs
5. Current two-tool approach (`create_entities` + `create_relations`) allows incomplete graphs

---

## ✅ Approved Solutions

### 1. **Unified Tool: `save_memory`**

**Problem:** Two separate tools allow LLM to skip relation creation  
**Solution:** Combine into single atomic operation

#### Schema:
```typescript
interface SaveMemoryInput {
  entities: Array<{
    // Entity identification
    name: string;           // Required, max 100 chars
    entityType: string;     // Required, free text (NOT enum), max 50 chars
    
    // Observations (facts)
    observations: string[]; // Required, min 1, each max 150 chars
    
    // Relations (MANDATORY!)
    relations: Array<{
      targetEntity: string; // Must reference entity in same request
      relationType: string; // Free text, max 50 chars
      importance?: number;  // 0-1, default 0.7
    }>;  // Required, min 1 (enforced by schema)
    
    // Metadata
    confidence?: number;    // 0-1, default 1.0
    importance?: number;    // 0-1, default 0.5
  }>;
  
  threadId: string;         // Required
}

interface SaveMemoryOutput {
  success: boolean;
  created: {
    entities: number;
    relations: number;
  };
  warnings: string[];       // Soft validation warnings
  quality_score: number;    // 0-1 based on graph completeness
  validation_errors?: string[]; // If failed
}
```

#### Key Features:
- **Atomic transaction**: Either all entities + relations succeed, or rollback
- **Relations embedded** in entity definition (can't be skipped)
- **Server-side validation** rejects if observations too long
- **Single tool call** reduces error opportunities

---

### 2. **Hard Limits on Observation Length**

**Problem:** LLMs create multi-sentence observations instead of atomic facts  
**Solution:** Server-side validation with rejection (NO NLP processing)

#### Rules:
```typescript
function countSentences(text: string): number {
  // Remove version numbers (e.g., 1.2.0, v5.4.3, V2.1.0) and decimal numbers before counting
  // Using explicit case handling [vV] for version prefix
  const cleaned = text
    .replace(/\b[vV]?\d+\.\d+(\.\d+)*\b/g, 'VERSION'); // handles version numbers and decimals
  
  const sentences = cleaned.split(/[.!?]/).filter(s => s.trim().length > 0);
  return sentences.length;
}

function validateObservation(obs: string): ValidationResult {
  const MAX_LENGTH = 150;  // Characters
  const MAX_SENTENCES = 3;  // Ignoring periods in version numbers
  
  if (obs.length > MAX_LENGTH) {
    return {
      valid: false,
      error: `Observation too long (${obs.length} chars). Max ${MAX_LENGTH}. Split into multiple observations.`
    };
  }
  
  const sentenceCount = countSentences(obs);
  if (sentenceCount > MAX_SENTENCES) {
    return {
      valid: false,
      error: `Too many sentences (${sentenceCount}). Max ${MAX_SENTENCES}. One fact per observation.`
    };
  }
  
  return { valid: true };
}
```

#### Behavior:
- **Reject entire request** if any observation exceeds limits
- **Clear error message** showing which observation failed
- **No automatic splitting** - LLM must fix and retry

---

### 3. **Flexible EntityType (No Enum)**

**Problem:** Different domains need different entity types  
**Solution:** Free-form text with soft suggestions

#### Approach:
```typescript
entityType: z.string()
  .min(1)
  .max(50)
  .describe(`
    Type of entity. Common types: Person, Document, File, Code, Task, Knowledge.
    You can use any custom type for your domain (e.g., Patient, API, Recipe).
    Convention: start with capital letter.
  `)
```

#### Validation:
- **No hard restrictions** on values
- **Soft normalization**: auto-capitalize first letter
- **Warnings** (not errors) for:
  - Lowercase start: `"person"` → warning suggests `"Person"`
  - Spaces in type: `"API Key"` → warning suggests `"ApiKey"`
- **Suggestions** shown in error messages if similar to common types

#### Common Types (for reference, not enforced):
- Person, Document, File, Code, Task, Knowledge
- API, Database, Service, Configuration
- Patient, Doctor, Diagnosis (medical domain)
- Customer, Product, Order (business domain)

---

### 4. **Mandatory Relations**

**Problem:** Entities created without connections create orphaned nodes  
**Solution:** Enforce minimum 1 relation per entity via JSON schema

#### Schema Enforcement:
```json
"relations": {
  "type": "array",
  "minItems": 1,
  "items": {
    "type": "object",
    "properties": {
      "targetEntity": { "type": "string" },
      "relationType": { "type": "string", "maxLength": 50 }
    },
    "required": ["targetEntity", "relationType"]
  }
}
```

#### Validation:
- Tool call **fails** if any entity has `relations: []`
- Error message: `"Entity 'X' must have at least 1 relation"`
- **Exception**: Root entities can be marked with special flag (future)

---

## 📊 Analytics (Limited Scope)

**Decision:** Keep analytics minimal - only 4 core metrics

### New Tool: `get_analytics`

```typescript
interface GetAnalyticsInput {
  threadId: string;
}

interface GetAnalyticsOutput {
  // 1. Recent changes (chronological)
  recent_changes: Array<{
    entityName: string;
    entityType: string;
    lastModified: string; // ISO timestamp
    changeType: 'created' | 'updated';
  }>;
  
  // 2. Top by importance
  top_important: Array<{
    entityName: string;
    entityType: string;
    importance: number;
    observationCount: number;
  }>;
  
  // 3. Most connected (graph centrality)
  most_connected: Array<{
    entityName: string;
    entityType: string;
    relationCount: number;
    connectedTo: string[]; // Entity names
  }>;
  
  // 4. Orphaned entities (quality check)
  orphaned_entities: Array<{
    entityName: string;
    entityType: string;
    reason: 'no_relations' | 'broken_relation';
  }>;
}
```

**Why only these 4?**
- LLMs won't use complex queries anyway
- Simple metrics cover 90% of use cases
- Fast to compute, easy to understand

---

## 🔄 Observation Versioning

**Decision:** Implement versioning to track changes over time

### Schema Addition:
```typescript
interface Observation {
  id: string;              // Unique ID
  content: string;         // The fact
  timestamp: string;       // ISO 8601
  version: number;         // Incremented on update
  supersedes?: string;     // ID of previous observation (if updated)
  agentThreadId: string;
  confidence: number;
  importance: number;
}
```

### Behavior:
- `add_observations` **appends** new observations (doesn't replace)
- Old observations remain but marked as superseded
- `get_observation_history(entityName, observationId)` retrieves version chain

### Example:
```typescript
{
  "name": "Python Scripts",
  "observations": [
    {
      "id": "obs_001",
      "content": "Uses python-docx 1.1.0",
      "version": 1,
      "timestamp": "2026-01-15T10:00:00Z",
      "superseded_by": "obs_002"
    },
    {
      "id": "obs_002",
      "content": "Uses python-docx 1.2.0",
      "version": 2,
      "timestamp": "2026-01-20T15:30:00Z"
    }
  ]
}
```

---

## 🚫 What NOT to Implement

### 1. Multi-Agent Conflict Resolution
**Reason:** Each agent has its own separate memory (separate threads)  
**Future:** May be handled at LangGraph level with manual user confirmation

### 2. NLP-based Observation Splitting
**Reason:** Too complex, not worth the effort  
**Approach:** Simple validation rejection instead

### 3. Complex Query Language (Cypher-style)
**Reason:** LLMs won't use it - they prefer simple tools  
**Keep:** Simple `search_nodes`, `query_nodes`, `find_relation_path`

### 4. Domain-Specific Schema Validation
**Reason:** Users won't configure this  
**Keep:** General validation only (length, atomicity, relations)

### 5. Permissions / Access Control
**Reason:** System is single-user  
**Future:** Maybe later for multi-tenant

### 6. Relation Type Validation Rules
**Reason:** Nobody will define these rules  
**Keep:** Full freedom for relation types

### 7. Export/Import (for now)
**Reason:** Everything writes to file already  
**Future:** Planned as separate feature

---

## 🎯 Implementation Phases

### **Phase 1: Core Refactoring** (High Priority)
1. Create `save_memory` tool
   - Combine entity + relation creation
   - Atomic transaction (all-or-nothing)
   
2. Add server-side validation
   - Observation length: max 150 chars, max 3 sentences (ignoring periods in version numbers)
   - Relations: min 1 per entity
   - Clear error messages with examples
   
3. Update JSON schema
   - `entityType`: free text with suggestions
   - `relations`: required field (minItems: 1)
   - `observations`: maxLength: 150

### **Phase 2: Versioning** (Medium Priority)
4. Add version tracking to observations
5. Implement `add_observations` with history preservation
6. Create `get_observation_history` tool

### **Phase 3: Analytics** (Medium Priority)
7. Implement `get_analytics` with 4 metrics
8. Optimize for performance (caching if needed)

---

## 📋 JSON Schema for save_memory Tool

```json
{
  "name": "save_memory",
  "description": "Save entities and their relations to memory graph. RULES: 1) Each observation max 150 chars (atomic facts only). 2) Each entity MUST have at least 1 relation.",
  "parameters": {
    "type": "object",
    "properties": {
      "entities": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 100
            },
            "entityType": {
              "type": "string",
              "minLength": 1,
              "maxLength": 50,
              "description": "Type of entity (e.g., Person, Document, File, or custom types like Patient, API)"
            },
            "observations": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "string",
                "minLength": 5,
                "maxLength": 150
              },
              "description": "Array of atomic facts. Each must be ONE fact, max 150 chars."
            },
            "relations": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "properties": {
                  "targetEntity": {
                    "type": "string",
                    "description": "Name of entity to connect to (must exist in this request)"
                  },
                  "relationType": {
                    "type": "string",
                    "maxLength": 50,
                    "description": "Type of relationship (e.g., 'created by', 'contains', 'uses')"
                  },
                  "importance": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1,
                    "default": 0.7
                  }
                },
                "required": ["targetEntity", "relationType"]
              },
              "description": "REQUIRED: Every entity must have at least 1 relation"
            },
            "confidence": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "default": 1.0
            },
            "importance": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "default": 0.5
            }
          },
          "required": ["name", "entityType", "observations", "relations"]
        }
      },
      "threadId": {
        "type": "string",
        "minLength": 1,
        "description": "Thread ID for this conversation/project"
      }
    },
    "required": ["entities", "threadId"]
  }
}
```

---

## ⚠️ Error Message Examples

### Observation Too Long:
```json
{
  "error": "Validation failed",
  "entity": "Portfolio Document",
  "observation": "Contains 2 main tables. Planning is in Section I. Activities are in Section II with 21 records. Appendices contain certificates.",
  "problem": "Too many sentences (4). Max 3.",
  "suggestion": "Split into 3 observations: 1) 'Contains planning table (Section I)', 2) 'Contains activities table (Section II) with 21 records', 3) 'Appendices contain certificates'"
}
```

### Missing Relations:
```json
{
  "error": "Validation failed",
  "entity": "Python Scripts",
  "problem": "Missing relations. Every entity must have at least 1 relation.",
  "suggestion": "Add relations to show connections: e.g., { targetEntity: 'Portfolio', relationType: 'updates' }"
}
```

### Invalid Relation Target:
```json
{
  "error": "Validation failed",
  "entity": "Andrii",
  "relation": { "targetEntity": "NonExistent", "relationType": "created" },
  "problem": "Target entity 'NonExistent' not found in request",
  "suggestion": "targetEntity must reference another entity in the same save_memory call"
}
```

---

## 🧪 Test Cases

### Valid Request:
```typescript
save_memory({
  entities: [
    {
      name: "Andrii",
      entityType: "Person",
      observations: [
        "Works at Google",
        "Author of MCP Memory Server",
        "Uses Windows"
      ],
      relations: [
        { targetEntity: "Python Scripts", relationType: "created" },
        { targetEntity: "Portfolio", relationType: "updates for" }
      ],
      importance: 1.0
    },
    {
      name: "Python Scripts",
      entityType: "CodeArtifact",
      observations: [
        "update_portfolio.py is main script",
        "Uses python-docx 1.2.0",
        "Uses lxml 6.0.2"
      ],
      relations: [
        { targetEntity: "Andrii", relationType: "created by" },
        { targetEntity: "Portfolio", relationType: "modifies" }
      ],
      importance: 0.6
    },
    {
      name: "Portfolio",
      entityType: "Document",
      observations: [
        "Final file: shevchenko-viktoria-yevgenivna-v4.docx",
        "Contains 2 main tables",
        "Total 21 records"
      ],
      relations: [
        { targetEntity: "Python Scripts", relationType: "modified by" },
        { targetEntity: "Andrii", relationType: "updated by" }
      ],
      importance: 0.9
    }
  ],
  threadId: "portfolio-update-2026"
})
```

### Invalid Request (Observation Too Long):
```typescript
save_memory({
  entities: [{
    name: "Test",
    entityType: "Example",
    observations: [
      "This is a very long observation that contains multiple facts and exceeds the maximum allowed length of 150 characters which will cause validation to fail"
    ],
    relations: [{ targetEntity: "Other", relationType: "related" }]
  }],
  threadId: "test"
})
// Error: Observation too long (165 chars). Max 150.
```

### Invalid Request (No Relations):
```typescript
save_memory({
  entities: [{
    name: "Isolated Entity",
    entityType: "Test",
    observations: ["Some fact"],
    relations: []  // ERROR!
  }],
  threadId: "test"
})
// Error: Entity 'Isolated Entity' must have at least 1 relation
```

---

## 📚 Documentation Updates Needed

### 1. Tool Description
Update MCP server manifest with new `save_memory` tool and deprecation notice for old tools.

### 2. User Guide
Create guide explaining:
- **Atomic observations**: One fact per observation, max 150 chars
- **Mandatory relations**: Every entity must connect to at least one other
- **Free entityType**: Use any type that makes sense for your domain
- **Error messages**: How to interpret and fix validation errors

### 3. Migration Guide
For existing users:
- Old tools (`create_entities`, `create_relations`) remain available (deprecated)
- New code should use `save_memory` exclusively
- No automatic migration - users update code gradually

---

## 🎯 Success Metrics

After implementation, measure:

1. **Relation Coverage**: % of entities with at least 1 relation
   - Target: 100% (enforced by schema)

2. **Observation Atomicity**: % of observations under 150 chars
   - Target: 100% (enforced by validation)

3. **Error Rate**: % of save_memory calls that fail validation
   - Target: < 10% (with clear error messages, LLMs learn to comply)

4. **Graph Quality Score**: Average relations per entity
   - Target: > 2.0 (well-connected graph)

---

## 🔗 Related Documents

- Original MCP Memory Server README
- LangGraph integration guide (future)
- API documentation for all memory tools

---

## 👥 Contributors

**Primary Author:** Andrii (Google)  
**Discussion Date:** January 20, 2026  
**Implementation:** TBD

---

## 📝 Changelog

- **2026-01-20**: Initial specification based on design discussion
- **Future**: Implementation notes and learnings to be added

---

## ✅ Approval Checklist

- [x] Core problem identified (LLM reliability)
- [x] Solution doesn't rely on NLP complexity
- [x] Schema enforces critical requirements (relations, atomicity)
- [x] EntityType remains flexible for different domains
- [x] Analytics kept minimal and practical
- [x] Future features identified but not over-engineered
- [x] Error messages are clear and actionable
- [x] Single-user assumption documented

**Status:** ✅ Specification Complete - Ready for Implementation

---

*End of Document*
