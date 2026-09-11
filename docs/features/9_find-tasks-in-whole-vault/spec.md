# Find Tasks in Whole Vault

## Scenarios

### Scenario: Allow the User to Select Whole Vault as Task Source
- **GIVEN** The user wants to select more than one note as a task source
- **WHEN** the user enters the settings
- **THEN** show also option to select the whole vault as a source or just tasks with a certain to be specified tag

### Scenario: Task or note moved
- **GIVEN** a task or the note containing a task is moved
- **WHEN** the task is still in the scope to be a valid source
- **THEN** update the block to the new location
- **AND** do not create a new vblock or new block id

- **GIVEN** a task or the note containing a task is moved
- **WHEN** the task is now outside the valid source scope
- **THEN** remove the task from the task provider after the usual grace period of 2 days
- **AND** after the initial grace period for orphaned detection of 60s add the description for to be deleted tasks

### Scenario: Add Ignore File Pattern
- **WHEN** a thirs party sync tool syncs the Obsidian vault between devices
- **AND** this tool creates file with a certain name pattern on conflicts
- **THEN** allow the user to put a file name pattern in the settings
- **AND** ignore files matching this pattern when looking for tasks
