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
    z.string().min(5).max(300).describe("Atomic fact, max 300 chars (increased to accommodate technical content)")
  ).min(1).describe("Array of atomic facts. Each must be ONE fact, max 300 chars."),
  relations: z.array(SaveMemoryRelationSchema)
    .min(1)
    .describe("REQUIRED: Every entity must have at least 1 relation"),
  confidence: z.number().min(0).max(1).optional().default(1.0).describe("Confidence in the accuracy (0-1)"),
  importance: z.number().min(0).max(1).optional().default(0.5).describe("Importance for memory integrity (0-1)")
});

export const SaveMemoryInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  entities: z.array(SaveMemoryEntitySchema).min(1).describe("Array of entities to save")
});

export const SaveMemoryOutputSchema = z.object({
  success: z.boolean(),
  created: z.object({
    entities: z.number(),
    relations: z.number(),
    entity_names: z.array(z.string()).optional().describe("Names of created entities (for reference in subsequent calls)")
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
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  entityName: z.string().min(1).describe("Name of the entity"),
  observationId: z.string().min(1).describe("ID of the observation to retrieve history for")
});

export const GetObservationHistoryOutputSchema = z.object({
  history: z.array(ObservationSchema).describe("Full version chain of the observation, chronologically ordered")
});

// Schema for list_entities tool (Simple Entity Lookup)
export const ListEntitiesInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  entityType: z.string().optional().describe("Filter by entity type (e.g., 'Person', 'Service', 'Document')"),
  namePattern: z.string().optional().describe("Filter by name pattern (case-insensitive substring match)")
});

export const ListEntitiesOutputSchema = z.object({
  entities: z.array(z.object({
    name: z.string(),
    entityType: z.string()
  })).describe("List of entities matching the filters")
});

// Schema for validate_memory tool (Pre-Validation)
export const ValidateMemoryInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  entities: z.array(SaveMemoryEntitySchema).min(1).describe("Array of entities to validate")
});

export const ValidateMemoryOutputSchema = z.object({
  all_valid: z.boolean().describe("True if all entities pass validation"),
  results: z.array(z.object({
    index: z.number().describe("Entity index in the input array"),
    name: z.string().describe("Entity name"),
    type: z.string().describe("Entity type"),
    valid: z.boolean().describe("True if this entity passes validation"),
    errors: z.array(z.string()).describe("List of validation errors"),
    warnings: z.array(z.string()).describe("List of validation warnings")
  })).describe("Validation results for each entity")
});

// Schema for update_observation tool
export const UpdateObservationInputSchema = z.object({
  agentThreadId: z.string().min(1).describe("Agent thread ID making this update"),
  entityName: z.string().min(1).describe("Name of the entity containing the observation"),
  observationId: z.string().min(1).describe("ID of the observation to update"),
  newContent: z.string().min(1).max(300).describe("New content for the observation (max 300 chars). Minimum 1 character to allow short but valid observations like abbreviations or single words."),
  timestamp: z.string().describe("ISO 8601 timestamp of the update"),
  confidence: z.number().min(0).max(1).optional().describe("Optional confidence score (0-1), inherits from old observation if not provided"),
  importance: z.number().min(0).max(1).optional().describe("Optional importance score (0-1), inherits from old observation if not provided")
});

export const UpdateObservationOutputSchema = z.object({
  success: z.boolean(),
  updatedObservation: ObservationSchema.describe("The new version of the observation"),
  message: z.string()
});

// Schema for read_graph tool
export const ReadGraphInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project")
});

// Schema for search_nodes tool
export const SearchNodesInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  query: z.string().min(1).describe("Search query string")
});

// Schema for open_nodes tool
export const OpenNodesInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  names: z.array(z.string()).min(1).describe("Array of entity names to open")
});

// Schema for query_nodes tool
export const QueryNodesInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  timestampStart: z.string().optional().describe("Filter by start timestamp (ISO 8601)"),
  timestampEnd: z.string().optional().describe("Filter by end timestamp (ISO 8601)"),
  confidenceMin: z.number().min(0).max(1).optional().describe("Filter by minimum confidence (0-1)"),
  confidenceMax: z.number().min(0).max(1).optional().describe("Filter by maximum confidence (0-1)"),
  importanceMin: z.number().min(0).max(1).optional().describe("Filter by minimum importance (0-1)"),
  importanceMax: z.number().min(0).max(1).optional().describe("Filter by maximum importance (0-1)")
});

// Schema for get_memory_stats tool
export const GetMemoryStatsInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project")
});

// Schema for get_recent_changes tool
export const GetRecentChangesInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  since: z.string().describe("ISO 8601 timestamp to get changes since")
});

// Schema for find_relation_path tool
export const FindRelationPathInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  from: z.string().min(1).describe("Source entity name"),
  to: z.string().min(1).describe("Target entity name"),
  maxDepth: z.number().int().min(1).optional().default(5).describe("Maximum path depth (default: 5)")
});

// Schema for detect_conflicts tool
export const DetectConflictsInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project")
});

// Schema for get_flagged_entities tool
export const GetFlaggedEntitiesInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project")
});

// Schema for get_context tool
export const GetContextInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  entityNames: z.array(z.string()).min(1).describe("Array of entity names to get context for"),
  depth: z.number().int().min(1).optional().default(1).describe("Context depth (default: 1)")
});

// Schema for create_entities tool
export const CreateEntitiesInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  entities: z.array(EntitySchema).describe("Array of entities to create")
});

// Schema for create_relations tool
export const CreateRelationsInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  relations: z.array(RelationSchema).describe("Array of relations to create")
});

// Schema for add_observations tool
export const AddObservationsInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  observations: z.array(z.object({
    entityName: z.string().describe("The name of the entity to add the observations to"),
    contents: z.array(z.string()).describe("An array of observation contents to add"),
    agentThreadId: z.string().describe("The agent thread ID adding these observations"),
    timestamp: z.string().describe("ISO 8601 timestamp of when the observations are added"),
    confidence: z.number().min(0).max(1).describe("Confidence coefficient from 0 to 1"),
    importance: z.number().min(0).max(1).describe("Importance for memory integrity if lost: 0 (not important) to 1 (critical)")
  })).describe("Array of observations to add")
});

// Schema for delete_entities tool
export const DeleteEntitiesInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  entityNames: z.array(z.string()).describe("An array of entity names to delete")
});

// Schema for delete_observations tool
export const DeleteObservationsInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  deletions: z.array(z.object({
    entityName: z.string().describe("The name of the entity containing the observations"),
    observations: z.array(z.string()).describe("An array of observations to delete")
  })).describe("Array of deletions to perform")
});

// Schema for delete_relations tool
export const DeleteRelationsInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  relations: z.array(RelationSchema).describe("An array of relations to delete")
});

// Schema for prune_memory tool
export const PruneMemoryInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  olderThan: z.string().optional().describe("ISO 8601 timestamp - remove entities older than this"),
  importanceLessThan: z.number().min(0).max(1).optional().describe("Remove entities with importance less than this value"),
  keepMinEntities: z.number().optional().describe("Minimum number of entities to keep regardless of filters")
});

// Schema for bulk_update tool
export const BulkUpdateInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  updates: z.array(z.object({
    entityName: z.string(),
    confidence: z.number().min(0).max(1).optional(),
    importance: z.number().min(0).max(1).optional(),
    addObservations: z.array(z.string()).optional()
  })).describe("Array of updates to perform")
});

// Schema for flag_for_review tool
export const FlagForReviewInputSchema = z.object({
  threadId: z.string().min(1).describe("Thread ID for this conversation/project"),
  entityName: z.string().describe("Name of entity to flag"),
  reason: z.string().describe("Reason for flagging"),
  reviewer: z.string().optional().describe("Optional reviewer name")
});
