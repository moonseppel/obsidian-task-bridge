# Include Deletion Time in Orphan Notice

## Scenarios

### Scenario: Orphaned task receives a notice with time of deletion
- **GIVEN** an orphaned task that has been unlinked for the grace period
- **WHEN** the plugin appends the orphan notice to its description
- **THEN** the notice states the date AND time (hours and minutes) when the task will be permanently removed (e.g., `YYYY-MM-DD HH:MM`)
- **AND** the time reflects the scheduled removal time

## Non-Features
1. Does not change how or when the tasks are actually removed, only the user-facing text in the remote task description.

