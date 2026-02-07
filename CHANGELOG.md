# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2.0] - 2026-02-07

### Added

#### Importance-Based Filtering
- **`minImportance` parameter for read_graph tool** - New filtering capability with ARCHIVED status:
  - Optional parameter with default value of 0.1
  - Filters out entities, relations, and observations with importance below threshold
  - Items with importance >= minImportance and < 0.1 are marked with `status: 'ARCHIVED'`
  - ARCHIVED status signals data that may be outdated or less relevant
  - Observations inherit importance from parent entity when not explicitly set
  - Filtering cascades: low-importance observations are removed even from high-importance entities

#### Type System Updates
- **Added `status` field** to Entity, Relation, and Observation interfaces:
  - Optional field with literal type `'ARCHIVED'`
  - Included in TypeScript types and Zod schemas
  - Backward compatible - field only present when applicable

### Changed
- **Version bumped** from 3.1.0 to 3.2.0 (minor version)
- Enhanced `read_graph` tool with importance-based filtering logic
- Updated schema descriptions to clarify ARCHIVED status behavior

### Technical Details
- Default minImportance of 0.1 filters out low-value data while maintaining historical context
- The 0.1 threshold for ARCHIVED status is a constant, separating filtering policy (user-controlled) from data quality semantics (system-defined)
- Comprehensive test coverage with 9 new tests covering filtering, ARCHIVED status, and observation inheritance
- All 240 tests passing with no breaking changes

### Use Cases
- **Memory Management**: Reduce payload size by filtering low-importance items
- **Data Quality**: Identify potentially outdated information via ARCHIVED status
- **Progressive Disclosure**: Show high-importance items by default, load archived items on demand
- **Historical Context**: Access older data with custom minImportance thresholds

## [3.1.0] - 2025-01-26

### Added

#### Documentation
- **Comprehensive README.md** - Complete project documentation including:
  - Clear explanation of the problem (context loss in long conversations) and solution
  - Visual diagrams showing multi-agent delegation flow
  - Installation instructions for Claude Desktop and VSCode with npx
  - Detailed usage guide with prompt examples for:
    - Regular snapshots during work
    - Restoring context in new chats
    - Delegating tasks to other agents
  - Complete API documentation for all 20+ available tools
  - Best practices for atomic facts and memory management
  - Real-world examples for project setup, progress tracking, and delegation
  - Multi-agent collaboration patterns (beyond just code)
  - Data model documentation (Entity, Relation, Observation schemas)
  - Development setup and storage backend information

- **MIT LICENSE** - Added standard MIT License file

#### Usage Examples
- **Prompt templates** for:
  - Starting new projects with memory
  - Taking conversation snapshots
  - Delegating tasks with context
  - Restoring context in new agents/chats
  - Checking project progress

#### Visual Documentation
- Multi-agent delegation flow diagram showing how dozens of agents can collaborate
- Cross-session memory sharing diagram
- Hierarchical task breakdown visualization

### Changed
- **Version bumped** from 3.0.0 to 3.1.0 (minor version)
- Enhanced package.json metadata for better npm discoverability

### Documentation Improvements
- Clarified that memory is NOT limited to code - can be used for writing, research, planning, learning, creative work
- Emphasized "atomic facts" principle throughout documentation
- Added concrete examples of good vs bad observation formats
- Included Neo4j Browser visualization capabilities
- Documented both JSONL and Neo4j storage options

### Use Cases Highlighted
- **Cross-chat coordination** - Share context between multiple Claude conversations
- **Task delegation** - Hand off subtasks to specialized agents with full context
- **Long conversation management** - Overcome context window limits
- **Multi-agent workflows** - Coordinate dozens of agents working on different parts of a project

## [2.3.1] - 2026-01-22

### Performance
- **Optimized entity/relation creation** - Replaced O(n²) duplicate detection with Set-based O(n) lookups
  - Entity creation now uses Set for name deduplication instead of nested array iterations
  - Relation creation uses JSON.stringify composite keys for collision-safe O(1) deduplication
  - Significant performance improvement for knowledge graphs with 1000+ entities
- **Optimized BFS path finding** - Pre-indexed relation lookups reduce repeated array scans
  - Build Map indexes at start of `findRelationPath()` for O(1) lookups per BFS node
  - Eliminates repeated O(n) filters of entire relations array
  - Major performance gain for deep graph traversals
- **Optimized observation operations** - Single-pass reduce for Set creation eliminates intermediate arrays
  - `addObservations()` now uses reduce instead of filter+map chain
  - Removes unnecessary array allocations during duplicate detection
- **Optimized negation word detection** - Improved word boundary matching without intermediate allocations
  - Uses `\b[\w']+\b` regex for robust word extraction, keeping contractions (e.g., "don't") as single words
  - Checks words directly against NEGATION_WORDS Set without creating temporary Set
  - Avoids unnecessary allocations in O(n²) conflict detection loops
- **Optimized JSONL serialization** - Direct array building eliminates spread operator overhead
  - `serializeThreadData()` builds lines array directly instead of using spread operators
  - Reduces memory allocations during serialization

### Technical Details
All optimizations maintain thread safety (local variables only), ACID semantics (no transaction changes), and memory integrity (no caching that could violate consistency). Pure internal optimizations with no breaking changes.

## [2.3.0] - 2026-01-22

### Added
- **update_observation tool** - New tool for updating observations while preserving version history:
  - Creates new observation versions with incremented version numbers
  - Maintains audit trail through `supersedes`/`superseded_by` chain
  - Smart inheritance: confidence/importance inherited from old observation or entity if not provided
  - Prevents updating already-superseded observations (enforces updating latest version)
  - Automatic entity timestamp update on observation changes
  - Full integration with `get_observation_history` for version tracking
  - Comprehensive test coverage with 8 unit tests following AAA pattern

### Changed
- **Increased observation character limit** - Raised max observation length from 150 to 300 characters:
  - Accommodates technical content (URLs, connection strings, file paths)
  - Better supports real-world use cases requiring longer atomic facts
  - Updated tool descriptions and documentation to reflect new limit
  - All validation logic and tests updated accordingly
- **Improved code modularity** - Refactored observation management with SOLID principles:
  - Extracted reusable helper methods for entity/observation lookup
  - Separated validation logic into focused methods
  - Created test helper utilities to reduce code duplication
  - Enhanced maintainability and testability of codebase

## [2.2.1] - 2026-01-21

### Changed
- **Improved sentence validation** - Updated observation validation to better handle technical content:
  - Increased max sentences from 2 to 3 per observation
  - Sentence counting now ignores periods in version numbers (e.g., "1.2.0", "v5.4.3")
  - Sentence counting now ignores periods in decimal numbers (e.g., "3.14")
  - Fixes issue where technical observations like "Library: python-docx version 1.2.0" were incorrectly rejected

### Fixed
- Corrected documentation examples to accurately reflect validation behavior

## [2.2.0] - 2026-01-21

### 🎉 Neo4j Storage Support

This minor release adds full support for Neo4j as an alternative storage backend with automatic fallback to file-based storage.

### Added

#### Neo4j Storage Backend
- **Full Neo4j implementation** - Production-ready `Neo4jStorageAdapter` with:
  - Complete CRUD operations using Cypher queries
  - Transactional writes for data consistency
  - Connection pooling and error handling
  - Automatic constraint and index creation
  - Observation serialization/deserialization

#### Environment-Based Configuration
- **Auto-detection and fallback** - Server automatically:
  - Detects Neo4j configuration via environment variables
  - Attempts connection to Neo4j if configured
  - Falls back to JSONL storage on failure or if not configured
  - Logs storage backend selection for transparency

#### Environment Variables
- `NEO4J_URI` - Neo4j connection URI (e.g., `neo4j://localhost:7687`)
- `NEO4J_USERNAME` - Neo4j username (default: `neo4j`)
- `NEO4J_PASSWORD` - Neo4j password
- `NEO4J_DATABASE` - Optional database name (default: `neo4j`)

#### Docker Support
- **Updated Dockerfile** - Added environment variable documentation:
  - Clear comments showing Neo4j configuration options
  - Maintains backward compatibility with file storage
  
- **docker-compose.yml** - Complete local development setup:
  - Neo4j 5.15.0 service with health checks
  - MCP server configured to use Neo4j
  - Persistent volumes for Neo4j data
  - Pre-configured credentials for quick start
  - Neo4j Browser available at http://localhost:7474

#### Testing
- **E2E test suite** (`neo4j-e2e.test.ts`) with 11 comprehensive tests:
  - Connection and initialization
  - Entity and relation CRUD operations
  - Persistence across operations
  - Observation handling
  - Entity deletion with cascade
  - Large graph handling (50+ entities)
  - Node search functionality
  - Concurrent operations
  - save_memory integration
  - Automatic skip when Neo4j not available

#### Documentation
- **README updates** - Comprehensive Neo4j documentation:
  - Environment variable configuration
  - Docker Compose usage instructions
  - Claude Desktop integration example
  - Benefits of Neo4j storage
  - Automatic fallback behavior
  
- **Dockerfile comments** - Clear configuration guidance

### Changed

- **Storage initialization** - Enhanced main function:
  - `createStorageAdapter()` function for backend selection
  - Logging for storage backend in use
  - Graceful error handling with fallback
  
- **Dependencies** - Added `neo4j-driver` (v6.0.1) to package.json

- **Version bumped** - From 2.1.0 to 2.2.0 (minor version)

### Benefits

- **Graph-native operations** - Neo4j provides:
  - Faster relationship traversals
  - Native graph algorithms
  - Better performance for large knowledge graphs
  - Advanced Cypher query capabilities
  
- **Visualization** - Neo4j Browser enables:
  - Visual knowledge graph exploration
  - Interactive query building
  - Real-time graph inspection
  
- **Scalability** - Better suited for:
  - Large-scale deployments
  - Complex relationship queries
  - High-concurrency scenarios
  
- **Zero disruption** - Automatic fallback ensures:
  - No breaking changes
  - Works without Neo4j
  - Smooth migration path

### Migration Guide

No changes required! The server maintains full backward compatibility:

```typescript
// Default behavior - uses JSONL storage
npx mcp-server-memory-enhanced

// With Neo4j - automatically detected
export NEO4J_URI=neo4j://localhost:7687
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD=password
npx mcp-server-memory-enhanced

// Docker Compose - Neo4j included
docker-compose up
```

### Testing

- All 88 existing tests pass
- 11 new Neo4j E2E tests (skip when Neo4j unavailable)
- Code coverage maintained at 66.7%
- Zero breaking changes

### Security

- Neo4j credentials via environment variables (not hardcoded)
- Secure connection handling
- Proper error handling prevents credential leakage
- Transaction support for data integrity

## [2.1.0] - 2026-01-21

### 🎉 Storage Abstraction Layer

This minor release introduces a storage abstraction layer enabling multiple backend implementations (Neo4j, PostgreSQL, etc.) while maintaining JSONL as the default storage backend.

### Added

#### Storage Abstraction
- **`IStorageAdapter` interface** - Clean abstraction for storage backends with 3 core methods:
  - `loadGraph()` - Load the entire knowledge graph
  - `saveGraph(graph)` - Save the complete graph
  - `initialize()` - Initialize storage (directories, connections, etc.)
  
- **`JsonlStorageAdapter`** - Refactored JSONL implementation:
  - Extracted from `KnowledgeGraphManager` into dedicated class
  - 20+ focused methods following Single Responsibility Principle
  - Improved error handling with proper type guards
  - Constants for all magic strings (THREAD_FILE_PREFIX, etc.)
  
- **`Neo4jStorageAdapter` skeleton** - Template implementation:
  - Comprehensive Cypher query examples
  - Clear TODOs for actual implementation
  - Connection management guidelines
  - Transaction handling patterns

#### Code Quality Improvements (SOLID, DRY, Clean Code)
- **Single Responsibility Principle**:
  - Methods average 5-10 lines each (down from 20-40)
  - Extracted validation: `isValidEntity()`, `isValidRelation()`
  - Centralized serialization: `serializeEntity()`, `serializeRelation()`
  - Helper methods: `getOrCreateThreadData()`, `isFileNotFoundError()`
  
- **Type Safety**:
  - Proper type guards (`FileSystemError`, `isValidString()`)
  - Eliminated unsafe type assertions
  - Thread data interfaces (`ThreadData`, `JsonlItem`)
  
- **Test Quality**:
  - Test helpers module with factory methods
  - `TestDirectoryFixture` class for setup/teardown
  - 60% reduction in test code duplication
  - Reusable entity/relation builders

#### Documentation
- **`STORAGE.md`** - Technical implementation guide
- **`STORAGE_EXAMPLES.md`** - Real-world usage patterns:
  - Basic JSONL usage
  - In-memory adapter for testing
  - PostgreSQL adapter example
  - Migration strategies
  
- **`CLEAN_CODE_SUMMARY.md`** - Refactoring details:
  - SOLID principles applied
  - DRY improvements
  - Before/after comparisons
  - Code quality metrics

### Changed

- **`KnowledgeGraphManager` refactored**:
  - Now accepts optional `IStorageAdapter` parameter
  - Defaults to `JsonlStorageAdapter` for backward compatibility
  - Automatic lazy initialization on first operation
  - Reduced by 207 lines through extraction
  
- **Improved initialization**:
  - Storage automatically initialized on first use
  - Prevents tight coupling between manager and storage
  - Custom adapters properly initialized
  
- **Test coverage improved**:
  - From 78% to 84.86% for JSONL adapter
  - 77/77 tests passing (6 new storage tests)
  - Comprehensive adapter substitutability tests

### Fixed

- **Storage initialization**:
  - Fixed issue where `initialize()` was never called
  - Implemented lazy initialization pattern
  - All public methods now ensure storage is initialized
  
- **Documentation consistency**:
  - Clarified when `initialize()` is needed
  - Added notes about automatic initialization
  - Fixed code coverage discrepancies
  
- **Code cleanup**:
  - Removed unused imports (Entity, Relation) from interfaces
  - Eliminated magic strings with constants
  - Fixed type safety issues with proper guards

### Migration Guide

No breaking changes! The refactoring is completely backward compatible:

```typescript
// Old usage still works exactly the same
const manager = new KnowledgeGraphManager('/path/to/data');
await manager.createEntities([/* ... */]);

// New: Custom storage adapter support
import { Neo4jStorageAdapter } from 'server-memory-enhanced';
const neo4j = new Neo4jStorageAdapter({ uri: 'neo4j://localhost:7687', ... });
const manager = new KnowledgeGraphManager('', neo4j);
```

### Design Rationale

- **Interface Segregation**: Minimal 3-method interface reduces implementation burden
- **Open/Closed Principle**: Open for extension (new backends) without modifying existing code
- **Dependency Inversion**: Manager depends on abstraction, not concrete storage
- **Lazy Initialization**: Initialization deferred until first use for better performance

### Code Quality Metrics

- **Methods**: 20+ focused functions (average 5-10 lines)
- **Test duplication**: Reduced by 60% using factory methods
- **Type safety**: Zero unsafe type assertions
- **Coverage**: 84.86% for JSONL adapter (↑ from 78%)

### Next Steps for Neo4j

1. Install `neo4j-driver` package
2. Implement methods using provided Cypher templates
3. Add transaction handling and connection pooling
4. Test with real Neo4j instance

## [2.0.0] - 2026-01-21

### 🎉 Major Release - Complete Architecture Overhaul

This is a major release implementing the MCP_Memory_Improvements_Spec.md with breaking changes to the data model and architecture.

### ⚠️ BREAKING CHANGES

- **Observation Versioning**: Observations changed from `string[]` to `Observation[]` objects with full version tracking
  - Each observation now has: `id`, `content`, `timestamp`, `version`, `supersedes`, `superseded_by`, `agentThreadId`
  - Data migration required for existing installations
  - All code interacting with observations must use `.content` to access text
- **confidence and importance fields** in Observation interface are now optional (inherit from entity if not set)

### Added

#### New Tools (Spec Sections 1-4 + Analytics)
1. **`save_memory`** ⭐ RECOMMENDED - Unified tool with atomic transactions (Section 1)
   - Atomically creates entities and relations in all-or-nothing transactions
   - Server-side validation with hard limits (no LLM prompt reliance)
   - Bidirectional relation creation (e.g., "contains" ↔ "contained in")
   - Quality score calculation based on graph completeness
   - Prevents orphaned nodes with mandatory relations

2. **`get_analytics`** - Simple analytics for knowledge graph insights
   - Recent changes: Last 10 entities sorted chronologically
   - Top important: Top 10 by importance score
   - Most connected: Top 10 by relation count
   - Orphaned entities: Quality check for broken/missing relations
   - Thread-specific filtering

3. **`get_observation_history`** - Version history tracking
   - Retrieves full version chain for any observation
   - Bidirectional traversal (forward and backward through versions)
   - Supports rollback by viewing previous versions

#### Validation Features (Spec Section 2)
- **Hard Limits on Observation Length**:
  - Min: 5 characters (NEW)
  - Max: 150 characters (hard rejection, no NLP)
  - Max 2 sentences per observation (atomic facts only)
  - Clear error messages with character/sentence counts
  - No automatic splitting - LLM must fix and retry

#### Data Model Enhancements (Spec Section 3)
- **Flexible EntityType** (no enum restrictions):
  - Free-form text (1-50 chars) - any custom types allowed
  - Soft normalization: auto-capitalize first letter (warnings, not errors)
  - Warnings for spaces in type names (e.g., "API Key" → suggests "APIKey")
  - Domain-specific types supported (Patient, API, Recipe, etc.)

#### Mandatory Relations (Spec Section 4)
- **Prevents Orphaned Nodes**:
  - JSON schema-level enforcement: min 1 relation per entity
  - Runtime validation with helpful suggestions
  - Clear error message: "Entity 'X' must have at least 1 relation"
  - Tool call fails if any entity has empty relations array

#### Modular Architecture & Clean Code
- **Extracted Modules** (SOLID principles):
  - `lib/types.ts` - Core type definitions
  - `lib/schemas.ts` - Zod validation schemas
  - `lib/validation.ts` - Observation/relation validation logic
  - `lib/save-memory-handler.ts` - Atomic transaction handler
  - `lib/knowledge-graph-manager.ts` - Graph operations
  - `lib/relation-inverter.ts` - Inverse relation mapping (SRP)
  - `lib/constants.ts` - Validation constants (DRY)

- **Test Infrastructure**:
  - `__tests__/test-helpers.ts` - Shared test utilities
  - Builder pattern for test data (ObservationBuilder, EntityBuilder)
  - TestDirectoryManager for setup/cleanup
  - Factory pattern for manager instantiation

#### Comprehensive Documentation
- **README Updates**:
  - `save_memory` tool listed as ⭐ RECOMMENDED
  - Deprecation notices for `create_entities` and `create_relations`
  - User Guide: atomic observations, mandatory relations, free entity types
  - Error message examples with solutions
  - Migration Guide with before/after code examples
  - Data model documentation for versioned observations

### Changed

- **Modular Structure**: Refactored monolithic 1380-line index.ts into focused modules
- **Code Quality**:
  - Removed 6 instances of unused imports/variables
  - Eliminated redundant validation checks
  - Fixed logic clarity issues
  - Applied SOLID principles (Single Responsibility, Open/Closed, Dependency Inversion)
  - Applied DRY principles (constants, test helpers, inverse relations)
- **EntityType Normalization**: Improved handling of multiple consecutive spaces
- **Test Coverage**: Expanded from 55 to 71 tests (29% increase)
  - New: `analytics.test.ts` - 8 tests
  - New: `observation-history.test.ts` - 8 tests
  - Enhanced: `save-memory-validation.test.ts` - 20 tests
  - Enhanced: `save-memory-integration.test.ts` - 9 tests

### Fixed

- **PR Review Issues**:
  - Fixed potential bug with multiple consecutive spaces in entityType
  - Added minimum observation length validation (5 chars)
  - Made confidence/importance optional in Observation (inherits from entity)
  - Improved code maintainability and cleanliness

### Deprecated

- `create_entities` - Use `save_memory` instead (still functional but deprecated)
- `create_relations` - Use `save_memory` instead (still functional but deprecated)

### Security

- CodeQL security scan: 0 alerts
- No vulnerabilities introduced
- Improved input validation with hard limits

### Performance

- Quality score calculation: `0.7 × (avg_relations/2) + 0.3 × (1 - avg_obs_length/150)`
- Efficient analytics computation using Maps and Sets
- Thread-specific filtering for better performance

### Testing

- All 71 tests pass
- 100% coverage on validation.ts, schemas.ts, constants.ts
- 68.62% overall code coverage
- Comprehensive test suite covering:
  - Observation length validation (min/max, sentence count)
  - Entity type normalization
  - Mandatory relations enforcement
  - Atomic transactions and rollback
  - Bidirectional relations
  - Analytics metrics (all 4)
  - Observation version chains
  - Error handling and edge cases

## [0.7.0] - 2026-01-20

### Added
- New `list_conversations` tool to list all available agent threads (conversations) with their metadata
  - Returns conversation/thread ID, entity count, relation count, first created timestamp, and last updated timestamp
  - Results are sorted by last updated timestamp (most recent first)
  - Comprehensive test coverage with 5 new test cases
- Updated minor version from 0.6.2 to 0.7.0

### Changed
- Enhanced test coverage from 58.66% to 60.52% statements
- Internal server version updated to 0.2.0 (from 0.1.0)

## [0.6.2] - Previous Release

Initial release with the following features:

### Features
- Agent Thread Isolation: Each agent thread writes to a separate file
- Timestamp Tracking: ISO 8601 timestamps for all entities and relations
- Confidence Scoring: Confidence coefficient (0.0 to 1.0) for each piece of knowledge
- Persistent Storage: JSONL format storage, one file per agent thread
- Full CRUD support for entities, relations, and observations

### Tools
1. create_entities - Create new entities with metadata
2. create_relations - Create relationships between entities
3. add_observations - Add observations to existing entities
4. delete_entities - Remove entities and cascading relations
5. delete_observations - Remove specific observations
6. delete_relations - Delete relationships
7. read_graph - Read the entire knowledge graph
8. search_nodes - Search entities by name, type, or observation content
9. open_nodes - Retrieve specific entities by name
10. query_nodes - Advanced querying with range-based filtering
11. get_memory_stats - Get comprehensive statistics
12. get_recent_changes - Retrieve entities and relations created/modified since a timestamp
13. prune_memory - Remove old or low-importance entities
14. bulk_update - Efficiently update multiple entities
15. find_relation_path - Find shortest path between two entities
16. get_context - Retrieve entities and relations related to specified entities
17. detect_conflicts - Detect conflicting observations
18. flag_for_review - Mark entities for human review
19. get_flagged_entities - Retrieve entities flagged for review
