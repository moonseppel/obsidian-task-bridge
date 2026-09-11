# Sync Task Deletion

## Scenarios

### Scenario: Delete from Obsidian
- **GIVEN** a task line was created by this plugin and is linked to a task in the task provider
- **WHEN** the line is deleted from the source note
- **THEN** the linked task in the task provider is deleted (or moved to trash, where the provider
  supports it)

### Scenario: Delete from the task provider
- **GIVEN** a task was created by this plugin and is linked to a line in the source note
- **WHEN** the task is deleted in the task provider
- **THEN** the linked line is removed from the source note

### Scenario: Sync Conflicts
- **GIVEN** a deletion and another change are synced together
- **WHEN** a sync conflict arises
- **THEN** the conflict is handled by the conflict resolution established in feature 5
