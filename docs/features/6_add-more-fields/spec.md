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

### Scenario: Sync Conflicts
- **GIVEN** state or priority are synced between the task provider and Obsidian
- **WHEN** a sync conflit arises
- **THEN** the conflict is handled by the conlfict resolution establisehed in feature 5
