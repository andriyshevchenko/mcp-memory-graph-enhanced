/**
 * Neo4j Test Helpers
 * 
 * Provides utilities for Neo4j E2E tests following DRY principle.
 * Centralizes test configuration and setup logic.
 */

import { Neo4jStorageAdapter } from '../lib/neo4j-storage-adapter.js';
import { KnowledgeGraphManager } from '../lib/knowledge-graph-manager.js';
import { NEO4J_DEFAULTS } from '../lib/storage-config.js';

/**
 * Neo4j test configuration.
 * Centralized for DRY principle.
 */
export interface Neo4jTestConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

/**
 * Get Neo4j configuration from environment variables with defaults.
 * Extracted for testability and DRY.
 */
export function getNeo4jTestConfig(): Neo4jTestConfig {
  return {
    uri: process.env.NEO4J_URI || NEO4J_DEFAULTS.URI,
    username: process.env.NEO4J_USERNAME || NEO4J_DEFAULTS.USERNAME,
    password: process.env.NEO4J_PASSWORD || NEO4J_DEFAULTS.PASSWORD,
    database: process.env.NEO4J_DATABASE,
  };
}

/**
 * Test fixture for Neo4j storage adapter.
 * Follows AAA (Arrange-Act-Assert) pattern and provides clean setup/teardown.
 */
export class Neo4jTestFixture {
  private storage: Neo4jStorageAdapter | null = null;
  private manager: KnowledgeGraphManager | null = null;
  public isAvailable = false;

  /**
   * Setup Neo4j connection for tests.
   * Returns true if successful, false otherwise.
   */
  async setup(): Promise<boolean> {
    try {
      const config = getNeo4jTestConfig();
      this.storage = new Neo4jStorageAdapter(config);
      await this.storage.initialize();
      this.isAvailable = true;
      console.log('Neo4j connection successful');
      return true;
    } catch (error) {
      console.warn('Neo4j not available, skipping E2E tests:', error instanceof Error ? error.message : String(error));
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Get the storage adapter.
   * Throws if not initialized.
   */
  getStorage(): Neo4jStorageAdapter {
    if (!this.storage) {
      throw new Error('Storage not initialized. Call setup() first.');
    }
    return this.storage;
  }

  /**
   * Get the knowledge graph manager.
   * Creates a new manager with clean state.
   */
  getManager(): KnowledgeGraphManager {
    const storage = this.getStorage();
    this.manager = new KnowledgeGraphManager('', storage);
    return this.manager;
  }

  /**
   * Clear the database before each test.
   * Ensures test isolation.
   */
  async clearDatabase(): Promise<void> {
    if (this.isAvailable && this.storage) {
      await this.storage.saveGraph({ entities: [], relations: [] });
    }
  }

  /**
   * Cleanup resources after all tests.
   * Properly closes connections.
   */
  async teardown(): Promise<void> {
    if (this.isAvailable && this.storage) {
      try {
        await this.storage.saveGraph({ entities: [], relations: [] });
        await this.storage.close();
      } catch (error) {
        console.warn('Error during cleanup:', error);
      }
    }
  }
}

/**
 * Guard for skipping tests when Neo4j is unavailable.
 * Reduces test duplication (DRY).
 */
export function skipIfNeo4jUnavailable(isAvailable: boolean): void {
  if (!isAvailable) {
    console.log('Neo4j not available - test skipped');
  }
}
