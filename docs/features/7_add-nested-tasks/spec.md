# Add Neted Tasks

## Scenarios

### Scenario: Add Nested Tasks
- **GIVEN** a task in Obsidian has tasks below a task that are at least one level deeper
- **THEN** these tasks are synced as sperate tasks and all rules for tasks apply
- **AND** the task is synced as a nested task to the task provider
- **AND** this behavior is recursive for nested tasks further down the tree

- **WHEN** a task in the task provider has a nested task
- **THEN** the nested tasks are synced as sperate tasks and all rules for tasks apply
- **AND** the task in Obsidian also gets the nested tasks as tasks below the main task with an indention one level deeper
- **AND** this behavior is recursive for nested tasks further down the tree

- **WHEN** a nested task looses its parent
- **THEN** the task becomes it's own task without a parent on the other side of the sync, too
- **AND** all taks below still are sub-tasks of this task

### Scenario: Sync Conflicts
- **GIVEN** state or priority are synced between the task provider and Obsidian
- **WHEN** a sync conflit arises
- **THEN** the conflict is handled by the established conflict resolution
