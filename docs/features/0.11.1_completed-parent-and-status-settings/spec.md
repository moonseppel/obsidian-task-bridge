# Completed Parent and Status Settings

## Scenarios

### Scenario: A task created under a completed parent stays nested
- **GIVEN** a checked task line is nested under a parent whose task in the provider is already completed
- **WHEN** the task is created in the provider
- **THEN** it is nested under its parent's task in the provider
- **AND** the parent recorded for the link is the one the provider actually holds

### Scenario: An open task under a completed parent waits for the parent
- **GIVEN** an open task line is nested under a parent whose task in the provider is completed
- **WHEN** it is synced
- **THEN** no task is created for it
- **AND** the parent's task gets this line in its description, once: "TaskBridge tried to add a child to this task, but that is not supported by Todoist once the parent is completed. Reopening will allow the child to be synced in the next run. Child task title: " followed by the task's title
- **AND** that line never becomes part of the parent line's description in the note

- **GIVEN** a parent's task carries that line for a task
- **WHEN** the parent is reopened and the task is synced under it
- **THEN** the line is removed from the parent's description; until then it stays, indefinitely

### Scenario: An open synced task moved under a completed parent
- **GIVEN** an open task line that is already synced is indented under a parent whose task in the provider is completed
- **WHEN** it is synced
- **THEN** the task stays where it is in the provider, and the line stays where it is in the note
- **AND** the parent's task gets the same line in its description, removed the same way once the parent is reopened and the task is moved under it

### Scenario: No settings for the Tasks plugin's statuses
- **GIVEN** the Tasks plugin is enabled
- **WHEN** the settings of this pluigin are opened
- **THEN** there is no "Tasks plugin statuses" section
- **AND** every status syncs by the rule without configuration: a blank checkbox is open, any other character is completed
- **AND** the code that exists only for that section and its stored mapping is removed

## Architecture
1. Nesting a child under a completed parant behaves unexpected in Todoist. The parent is ignored on the first try and the child has to be again moved under its intended parent again tom ake it work. Since this is a Todoist specialty, it has to reside in the Todoist module.
