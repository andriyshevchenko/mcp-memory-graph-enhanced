// Observation with versioning support
export interface Observation {
  id: string;
  content: string;
  timestamp: string;
  version: number;
  supersedes?: string; // ID of previous observation (if updated)
  agentThreadId: string;
  confidence: number;
  importance: number;
}

// Enhanced entity with metadata
export interface Entity {
  name: string;
  entityType: string;
  observations: string[]; // Legacy: string array for backward compatibility
  observationsV2?: Observation[]; // New: versioned observations
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
