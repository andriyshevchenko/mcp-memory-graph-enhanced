# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
