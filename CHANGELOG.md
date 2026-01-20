# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-20

### 🎉 Major Release - MCP Memory Improvements Implementation

This is a major release implementing the comprehensive improvements outlined in MCP_Memory_Improvements_Spec.md. The focus is on improving LLM reliability by moving validation and workflow enforcement from prompts to the tool layer.

### Added

#### Phase 1: Core Refactoring
- **New `save_memory` tool** - Unified tool combining entity and relation creation in a single atomic operation
  - Enforces mandatory relations (minimum 1 per entity)
  - Server-side validation for observation length (max 150 chars, max 2 sentences)
  - Validates relations reference entities in the same request
  - Returns quality metrics based on graph completeness
  - Atomic transaction support (all-or-nothing)
- **Flexible entityType** - Free-form text field replacing enum restrictions
  - Soft validation with helpful warnings for naming conventions
  - Supports domain-specific types (Person, Document, Patient, API, etc.)
- **Enhanced validation** with clear, actionable error messages
  - Observation length validation with split suggestions
  - Missing relations detection
  - Invalid relation target validation

#### Phase 2: Observation Versioning
- **Observation versioning system** - Track changes to observations over time
  - Added `id`, `version`, `supersedes` fields to observations
  - Automatic migration of legacy observations
  - Version history preservation on updates
- **New `get_observation_history` tool** - Retrieve complete version history for any observation
  - Shows version chains with superseded relationships
  - Includes timestamps and version numbers

#### Phase 3: Analytics
- **New `get_analytics` tool** - Thread-specific analytics with 4 key metrics:
  1. **Recent changes** - Last 10 entities by modification time
  2. **Top important** - Entities sorted by importance score
  3. **Most connected** - Entities sorted by relation count
  4. **Orphaned entities** - Quality check for entities with no/broken relations

### Changed
- **Deprecated tools** - Old tools marked as deprecated but remain functional for backward compatibility:
  - `create_entities` - Use `save_memory` instead
  - `create_relations` - Use `save_memory` instead
- **Enhanced `add_observations` method** - Now uses versioning system (addObservationsV2)
  - Preserves observation history
  - Generates unique IDs for all observations
- **Improved test coverage** - From 60.52% to 68.9% statement coverage
  - Added 15 comprehensive tests for new functionality
  - Total 41 tests, all passing

### Technical Details
- **Breaking Changes**:
  - Observation structure now includes versioning fields
  - `save_memory` enforces stricter validation rules
  - entityType is now free-form text (previously had suggested values)
- **Migration Notes**:
  - Existing code using `create_entities` and `create_relations` continues to work
  - New code should use `save_memory` for better data quality
  - Legacy observations are automatically migrated to versioned format
- **Security**: No security vulnerabilities detected (CodeQL scan clean)
- **Quality**: All code review feedback addressed

### Specifications
This release implements all requirements from **MCP_Memory_Improvements_Spec.md** dated January 20, 2026:
- ✅ Unified tool architecture
- ✅ Hard limits on observation atomicity
- ✅ Flexible entity types
- ✅ Mandatory relation enforcement
- ✅ Observation versioning
- ✅ Limited-scope analytics
- ✅ Comprehensive validation with helpful error messages

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
