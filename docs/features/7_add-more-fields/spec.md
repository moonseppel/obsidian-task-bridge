# Add More Fields

## Scenarios

### Scenario: Add State
- **WHEN** a task is synced
- **THEN** the task in the task provider also gets the task state from Obsidian

- **WHEN** a task is synced
- **THEN** the task in Obsidian also gets the task state from taks provider

### Scenario: Add Priority
- **GIVEN** a task in Obsidian has a priority
- **WHEN** these changes are synced
- **THEN** the task in the task provider also gets the priority from Obsidian

- **GIVEN** a task in the task provider has a priority
- **WHEN** these changes are synced
- **THEN** the task in Obsidian also gets the priority from task provider

### Scenario: Add Description
- **GIVEN** a task in Obsidian has text below it that is indented at least one level deeper than the task itself
- **WHEN** the task is synced
- **THEN** the task in the task provider also gets a description that matches the indented text without the indention level of the task

- **GIVEN** a task in the task provider has a description
- **WHEN** the task is synced
- **THEN** the task in Obsidian also gets a text below the task indented one level deeper as the task that matches the description

### Scenario: Add Tags
- **GIVEN** a task in Obsidian has a tag
- **WHEN** these changes are synced
- **THEN** the task in the task provider also gets the tag from Obsidian as label

- **GIVEN** a task in the task provider has a label
- **WHEN** these changes are synced
- **THEN** the task in Obsidian also gets the label from the taks provider as tag

### Scenario: Sync Conflicts
- **GIVEN** any of the new fields is synced between the task provider and Obsidian
- **WHEN** a sync conflit arises
- **THEN** the conflict is handled by the established conflict resolution
