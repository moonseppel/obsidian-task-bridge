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

### Scenario: Old Functionality
- **WHEN** there is no task plugin installed
- **THEN** the plugin still has to work like before

### Scenario: Sync Conflicts
- **GIVEN** user defined states are synced between the task provider and Obsidian
- **WHEN** a sync conflit arises
- **THEN** the conflict is handled by the establisehed conlfict resolution

### Scenario: Which Tasks Plugin Settings Apply
- **GIVEN** the vault's list of enabled community plugins contains the Tasks plugin
- **WHEN** a sync runs or the settings are opened
- **THEN** the statuses are read from the Tasks plugin's own settings file at that moment, so a change made there applies from this sync run

- **GIVEN** the vault's list of enabled community plugins contains the Tasks plugin
- **WHEN** a sync runs or the settings are opened
- **AND** there is no configuration file for hte Tasks plugin found
- **THEN** the Tasks plugin's default statuses apply: ` ` Todo, `x` Done, `/` In Progress, `-` Cancelled

- **GIVEN** the Tasks plugin defines a state the task provider does not support
- **AND** the status is reperesented by any other character than a blank in the checkbox
- **THEN** this status is mapped to 'done'.

- **GIVEN** the Tasks plugin defines a state the task provider does not support
- **AND** the status is reperesented by a blank in the checkbox
- **THEN** this status is mapped to 'todo'.

### Scenario: Tasks Plugin Fields Stay in the Line
- **GIVEN** the Tasks plugin is enabled
- **AND** a task line ends in a run of Tasks plugin fields, possibly mixed with tags, in emoji format such as `📅 2026-09-20` or `✅ 2026-09-18`, or in Dataview format such as `[due:: 2026-09-20]` or `(due:: 2026-09-20)`, both formats alike, whichever one the Tasks plugin is set to write
- **WHEN** it is synced
- **THEN** those fields are not part of the title sent to the provider
- **AND** tags among those fields are still synced as tags

- **GIVEN** the Tasks plugin is enabled
- **AND** a task line ends in a run of Tasks plugin fields
- **WHEN** a changed title is pulled from the provider
- **THEN** the line reads as the new title, then the line's tags, then its Tasks plugin fields unchanged, then its block id

- **GIVEN** the Tasks plugin is enabled
- **WHEN** something that looks like a Tasks plugin field stands anywhere but in the run of fields and tags at the end of a task line, or is a Dataview field whose key the Tasks plugin does not use
- **THEN** it is part of the title, since the Tasks plugin itself does not read it as a field

- **GIVEN** a task was synced while its title in the provider still carried the text of Tasks plugin fields
- **WHEN** it is synced with the Tasks plugin enabled
- **THEN** the title without those fields is sent to the provider once, and the usual conflict resolution applies if the title changed in the provider at the same time

## Architecture
1. The mapping of user defined states is task porvider depedant, so it needs to be in the task provider module.
2. The changes needed to support the Tasks plugin should be placed in a separate module, if possible. Or as separate sub-modules of existing modules, if an own module if not possible.
