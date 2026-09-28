# Ignore Completed Tasks

## Scenarios

### Scenario: Do not sync newly seen completed tasks
- **GIVEN** a task line that is marked as completed
- **AND** the task does not have a block ID yet (it has never been synced)
- **WHEN** the plugin syncs the file
- **THEN** it skips the task entirely without giving it a block ID or creating it on the provider

### Scenario: Short-circuit fetching remote task if completed on both sides
- **GIVEN** a linked task that was completed on both sides during the last sync
- **AND** the task line is still completed locally
- **WHEN** the plugin syncs the file and does not find the task in the remote active tasks list
- **THEN** it does not call the remote provider to fetch the task
- **AND** the task remains completed locally

### Scenario: Buffered local edits on completed tasks
- **GIVEN** a linked task that was completed on both sides during the last sync
- **WHEN** the user edits the task's title or description in Obsidian but leaves it completed
- **THEN** the plugin skips fetching the remote task and does not immediately push the edit
- **BUT WHEN** the user unchecks the task locally
- **THEN** the plugin fetches the remote task, sees the local task is newer, and pushes both the uncheck and the edits to the provider

### Scenario: Unchecking a completed task deleted in the provider
- **GIVEN** a linked task that was completed on both sides during the last sync
- **AND** the task was deleted in the provider since
- **WHEN** the user unchecks the task line
- **THEN** the task is recreated from the line, with every edit made while it was completed, rather than the line being removed
