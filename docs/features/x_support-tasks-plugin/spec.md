# Support Tasks Plugin

## Scenarios

### Scenario: Support More States
- **GIVEN** the tasks plugin is used in Obsidian
- **WHEN** this plugin defines more user defines states
- **THEN** add settings to map these states to states of the task provider

- **GIVEN** the tasks plugin is used in Obsidian
- **AND** this plugin defines more user defines states
- **AND** at least one user defines state is mapped
- **WHEN** these changes are synced
- **THEN** the task in the task provider also gets the mappes states from Obsidian

- **GIVEN** the tasks plugin is used in Obsidian
- **AND** this plugin defines more user defines states
- **AND** at least one user defines state is mapped
- **WHEN** these changes are synced
- **THEN** the task in Obsidian also gets the mappes states from the task provider's task

### Scenario: Support Plugin in General
- **WHEN** the tasks plugin is used in Obsidian
- **THEN** the behavior of this plugin should still be the same as specified

### Scenario: Sync Conflicts
- **GIVEN** user defined states are synced between the task provider and Obsidian
- **WHEN** a sync conflit arises
- **THEN** the conflict is handled by the conlfict resolution establisehed in feature 5

## Architecture
1. The mapping of user defined states is task porvider depedant, so it needs to be in the task provider module.