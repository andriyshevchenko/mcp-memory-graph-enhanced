/**
 * Storage Configuration Constants
 * 
 * Centralizes all configuration constants for storage adapters.
 * Following DRY principle - define once, use everywhere.
 */

/**
 * Environment variable names for Neo4j configuration
 */
export const NEO4J_ENV_VARS = {
  URI: 'NEO4J_URI',
  USERNAME: 'NEO4J_USERNAME',
  PASSWORD: 'NEO4J_PASSWORD',
  DATABASE: 'NEO4J_DATABASE',
} as const;

/**
 * Default Neo4j configuration values
 */
export const NEO4J_DEFAULTS = {
  URI: 'neo4j://localhost:7687',
  USERNAME: 'neo4j',
  PASSWORD: 'testpassword',
} as const;

/**
 * Error messages for Neo4j storage
 */
export const NEO4J_ERROR_MESSAGES = {
  NOT_INITIALIZED: 'Neo4j driver not initialized. Call initialize() first.',
  CONNECTION_FAILED: 'Failed to initialize Neo4j connection',
  NOT_CONFIGURED: 'Neo4j not configured (NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD), using JSONL storage',
} as const;

/**
 * Log messages for storage selection
 */
export const STORAGE_LOG_MESSAGES = {
  ATTEMPTING_NEO4J: 'Attempting to connect to Neo4j at',
  NEO4J_SUCCESS: 'Successfully connected to Neo4j storage',
  NEO4J_FALLBACK: 'Failed to connect to Neo4j, falling back to JSONL storage:',
  USING_JSONL: 'Using JSONL storage at',
} as const;
