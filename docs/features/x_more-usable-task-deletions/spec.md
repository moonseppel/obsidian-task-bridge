# More Usable Task Deletions

## Scenarios

### Scenario: Quick Clean Up
- **GIVEN** the user wants to clean up the tasks in Todoist after changes in Obsidian
- **WHEN** a quick deletion command in Obsidian is run
- **THEN** the user is asked whether he wants to delete just the tasks already marked for deletion or any task that is now already up to deletion, but not marked yet
- **AND** depedning on his choice the command is executed to delete all matching tasks from Todoist instantly

### Scenario: Deletion Tag
- **WHEN** the user is entering the settings
- **THEN** he is able to configure a special tag that is put on tasks that are marked for deletion
- **AND** the default value for that tag is empty

- **WHEN** a task is marked as orphaned
- **AND** a tag for tasks that are marked for deletion is configured
- **THEN** it gets the special deletion tag that is configured

- **WHEN** a task is marked as orphaned
- **AND** a tag for tasks that are marked for deletion is empty
- **THEN** the task dioes not get the special deletion tag
