# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
