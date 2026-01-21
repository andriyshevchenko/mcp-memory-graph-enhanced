/**
 * Core types for the Memory Enhanced MCP Server
 */

// Observation with versioning support (Observation Versioning section of spec)
export interface Observation {
  id: string;              // Unique ID (e.g., "obs_001")
  content: string;         // The fact/observation text
  timestamp: string;       // ISO 8601 timestamp
  version: number;         // Version number (incremented on update)
  supersedes?: string;     // ID of previous observation (if this is an update)
  superseded_by?: string;  // ID of observation that supersedes this one
  agentThreadId: string;   // Thread that created this observation
  confidence?: number;     // 0-1: confidence in accuracy (optional, inherits from entity if not set)
  importance?: number;     // 0-1: importance for memory integrity (optional, inherits from entity if not set)
}

// Enhanced entity with metadata
export interface Entity {
  name: string;
  entityType: string;
  observations: Observation[];  // Changed from string[] to Observation[]
  agentThreadId: string;
  timestamp: string;
  confidence: number;
  importance: number; // 0-1: importance for memory integrity (0=not important, 1=critical)
}

// Enhanced relation with metadata
export interface Relation {
  from: string;
  to: string;
  relationType: string;
  agentThreadId: string;
  timestamp: string;
  confidence: number;
  importance: number; // 0-1: importance for memory integrity (0=not important, 1=critical)
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

// Types for save_memory tool (Section 1 of spec)
export interface SaveMemoryEntity {
  name: string;
  entityType: string;
  observations: string[];
  relations: Array<{
    targetEntity: string;
    relationType: string;
    importance?: number;
  }>;
  confidence?: number;
  importance?: number;
}

export interface SaveMemoryInput {
  entities: SaveMemoryEntity[];
  threadId: string;
}

export interface SaveMemoryOutput {
  success: boolean;
  created: {
    entities: number;
    relations: number;
  };
  warnings: string[];
  quality_score: number;
  validation_errors?: string[];
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
}

// Types for get_analytics tool (Analytics section of spec)
export interface GetAnalyticsInput {
  threadId: string;
}

export interface GetAnalyticsOutput {
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

// Types for get_observation_history tool (Observation Versioning section of spec)
export interface GetObservationHistoryInput {
  entityName: string;
  observationId: string;
}

export interface GetObservationHistoryOutput {
  history: Observation[];  // Full version chain
}
