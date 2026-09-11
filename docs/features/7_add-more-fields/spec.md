# Add More Fields

## Scenarios

### Scenario: Add State
- **WHEN** a task is synced
- **THEN** the task in the task provider also gets the task state from Obsidian

- **WHEN** a task is synced
- **THEN** the task in Obsidian also gets the task state from Obsidian

### Scenario: Add Priority
- **GIVEN** a task in Obsidian has a priority
- **WHEN** these changes are synced
- **THEN** the task in the task provider also gets the priority from Obsidian

- **GIVEN** a task in the task provider has a priority
- **WHEN** these changes are synced
- **THEN** the task in Obsidian also gets the priority from Obsidian

### Scenario: Add Description
- **GIVEN** a task in Obsidian has text below it that is indented at least one level deeper than the task itself
- **WHEN** the task is synced
- **THEN** the task in the task provider also gets a description that matches the indented text without the indention level of the task

- **GIVEN** a task in the task provider has a description
- **WHEN** the task is synced
- **THEN** the task in Obsidian also gets a text below the task indented one level deeper as the task that matches the description

### Scenario: Sync Conflicts
- **GIVEN** state or priority are synced between the task provider and Obsidian
- **WHEN** a sync conflit arises
- **THEN** the conflict is handled by the established conflict resolution
