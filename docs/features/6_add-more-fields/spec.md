# Add More Fields

## Scenarios

### Scenario: Add Priority
- **GIVEN** a task in Obsidian has a priority
- **WHEN** these changes are synced
- **THEN** the task in the task provider also gets the priority from Obsidian

- **GIVEN** a task in the task provider has a priority
- **WHEN** these changes are synced
- **THEN** the task in Obsidian also gets the priority from Obsidian

### Scenario: Sync Conflicts
- **GIVEN** changes are synced between the task provider and Obsidian
- **WHEN** a sync conflit arises
- **THEN** the conflict is handled by the conlfict resolution establisehed in feature 5

## Architecture
