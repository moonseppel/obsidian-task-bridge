# Add More Fields From the Tasks Plugin

## Scenarios

### Scenario: Add Due Date
- **GIVEN** a task in Obsidian has a due date
- **WHEN** a task is synced
- **THEN** the task in the task provider also gets the due date from Obsidian

- **GIVEN** a task in the task provider has a due date
- **WHEN** a task is synced
- **THEN** the task in Obsidian also gets the due date from taks provider

### Scenario: Add Recurrence
- **GIVEN** a task in Obsidian is recurring
- **WHEN** these changes are synced
- **THEN** the task in the task provider also gets the recurrence setting from Obsidian

- **GIVEN** a task in the task provider is recurring
- **WHEN** these changes are synced
- **THEN** the task in Obsidian also gets the recurrence setting from task provider

### Scenario: Add Created Date
- **GIVEN** a task in Obsidian has a created date
- **WHEN** a task is synced
- **THEN** the task in the task provider also gets the created date from Obsidian

- **GIVEN** a task in the task provider has a created date
- **WHEN** a task is synced
- **THEN** the task in Obsidian also gets the created date from taks provider

### Scenario: Add Completion Date
- **GIVEN** a task in Obsidian has a completion date
- **WHEN** a task is synced
- **THEN** the task in the task provider also gets the completion date from Obsidian

- **GIVEN** a task in the task provider has a completion date
- **WHEN** a task is synced
- **THEN** the task in Obsidian also gets the completion date from taks provider

### Scenario: Sync Conflicts
- **GIVEN** any of the new fields is synced between the task provider and Obsidian
- **WHEN** a sync conflit arises
- **THEN** the conflict is handled by the established conflict resolution

## Architecture
1. Priorities are matched like in the list below (Obsidian to Todoist). When syncing back from Todoist, be sure that a 1 does not overwrite a "high" and so on.
- Highest = 1
- High = 1
- Medium = 2
- Low = 3
- Lowest = 3
- None = 4
2. Datetimes just lose their time, when synced to date, but may not overwrite a time whne being synced back. When date syncs to datetime, datetime gets 0:00:00 time. Timezone is always local time of the device in which the code runs.
