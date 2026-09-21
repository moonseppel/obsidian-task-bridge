# Completed Parent and Status Settings

## Scenarios

### Scenario: A task created under a completed parent stays nested
- **GIVEN** a task line is nested under a parent whose task in the provider is already completed
- **WHEN** the task is created in the provider
- **THEN** it is nested under its parent's task in the provider
- **AND** the parent recorded for the link is the one the provider actually holds

### Scenario: No settings for the Tasks plugin's statuses
- **GIVEN** the Tasks plugin is enabled
- **WHEN** the settings of this pluigin are opened
- **THEN** there is no "Tasks plugin statuses" section
- **AND** every status syncs by the rule without configuration: a blank checkbox is open, any other character is completed
- **AND** the code that exists only for that section and its stored mapping is removed

## Architecture
1. Nesting a child under a completed parant behaves unexpected in Todoist. The parent is ignored on the first try and the child has to be again moved under its intended parent again tom ake it work. Since this is a Todoist specialty, it has to reside in the Todoist module.
