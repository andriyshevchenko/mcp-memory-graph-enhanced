/**
 * Zod schema definitions for MCP tools
 */

import { z } from "zod";

// Schema for Observation with versioning support
export const ObservationSchema = z.object({
  id: z.string().describe("Unique observation ID"),
  content: z.string().describe("The fact/observation text"),
  timestamp: z.string().describe("ISO 8601 timestamp"),
  version: z.number().int().min(1).describe("Version number (incremented on update)"),
  supersedes: z.string().optional().describe("ID of previous observation (if this is an update)"),
  superseded_by: z.string().optional().describe("ID of observation that supersedes this one"),
  agentThreadId: z.string().describe("Thread that created this observation"),
  confidence: z.number().min(0).max(1).optional().describe("Confidence in accuracy (0-1, optional, inherits from entity if not set)"),
  importance: z.number().min(0).max(1).optional().describe("Importance for memory integrity (0-1, optional, inherits from entity if not set)")
});

// Schema for existing tools
export const EntitySchema = z.object({
  name: z.string().describe("Unique identifier for the entity"),
  entityType: z.string().describe("Classification of the entity (e.g., person, document, task)"),
  observations: z.array(ObservationSchema).describe("Versioned observations about this entity"),
  agentThreadId: z.string().describe("Agent thread that created/modified this entity"),
  timestamp: z.string().describe("ISO 8601 timestamp of creation/modification"),
  confidence: z.number().min(0).max(1).describe("Confidence in the accuracy of this entity (0-1)"),
  importance: z.number().min(0).max(1).describe("Importance for memory integrity if lost: 0 (not important) to 1 (critical)")
});

export const RelationSchema = z.object({
  from: z.string().describe("Source entity name"),
  to: z.string().describe("Target entity name"),
  relationType: z.string().describe("Type of relation (should be in active voice, e.g., 'manages', 'created by')"),
  agentThreadId: z.string().describe("Agent thread that created/modified this relation"),
  timestamp: z.string().describe("ISO 8601 timestamp of creation/modification"),
  confidence: z.number().min(0).max(1).describe("Confidence in the accuracy of this relation (0-1)"),
  importance: z.number().min(0).max(1).describe("Importance for memory integrity if lost: 0 (not important) to 1 (critical)")
});

// Schema for save_memory tool (Section 1 of spec)
export const SaveMemoryRelationSchema = z.object({
  targetEntity: z.string().describe("Name of entity to connect to (must exist in this request)"),
  relationType: z.string().max(50).describe("Type of relationship (e.g., 'created by', 'contains', 'uses')"),
  importance: z.number().min(0).max(1).optional().default(0.7).describe("Importance of this relation (0-1)")
});

export const SaveMemoryEntitySchema = z.object({
  name: z.string().min(1).max(100).describe("Unique identifier for the entity"),
  entityType: z.string().min(1).max(50).describe(
    "Type of entity (e.g., Person, Document, File, or custom types like Patient, API). Convention: start with capital letter."
  ),
  observations: z.array(
    z.string().min(5).max(150).describe("Atomic fact, max 150 chars")
  ).min(1).describe("Array of atomic facts. Each must be ONE fact, max 150 chars."),
  relations: z.array(SaveMemoryRelationSchema)
    .min(1)
    .describe("REQUIRED: Every entity must have at least 1 relation"),
  confidence: z.number().min(0).max(1).optional().default(1.0).describe("Confidence in the accuracy (0-1)"),
  importance: z.number().min(0).max(1).optional().default(0.5).describe("Importance for memory integrity (0-1)")
});

export const SaveMemoryInputSchema = z.object({
  entities: z.array(SaveMemoryEntitySchema).min(1).describe("Array of entities to save"),
  threadId: z.string().min(1).describe("Thread ID for this conversation/project")
});

export const SaveMemoryOutputSchema = z.object({
  success: z.boolean(),
  created: z.object({
    entities: z.number(),
    relations: z.number()
  }),
  warnings: z.array(z.string()),
  quality_score: z.number().min(0).max(1),
  validation_errors: z.array(z.string()).optional()
});

// Schema for get_analytics tool (Analytics section of spec)
export const GetAnalyticsInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project")
});

export const GetAnalyticsOutputSchema = z.object({
  recent_changes: z.array(z.object({
    entityName: z.string(),
    entityType: z.string(),
    lastModified: z.string().describe("ISO timestamp"),
    changeType: z.enum(['created', 'updated'])
  })),
  top_important: z.array(z.object({
    entityName: z.string(),
    entityType: z.string(),
    importance: z.number().min(0).max(1),
    observationCount: z.number()
  })),
  most_connected: z.array(z.object({
    entityName: z.string(),
    entityType: z.string(),
    relationCount: z.number(),
    connectedTo: z.array(z.string()).describe("Entity names")
  })),
  orphaned_entities: z.array(z.object({
    entityName: z.string(),
    entityType: z.string(),
    reason: z.enum(['no_relations', 'broken_relation'])
  }))
});

// Schema for get_observation_history tool (Observation Versioning section of spec)
export const GetObservationHistoryInputSchema = z.object({
  entityName: z.string().min(1).describe("Name of the entity"),
  observationId: z.string().min(1).describe("ID of the observation to retrieve history for")
});

export const GetObservationHistoryOutputSchema = z.object({
  history: z.array(ObservationSchema).describe("Full version chain of the observation, chronologically ordered")
});
