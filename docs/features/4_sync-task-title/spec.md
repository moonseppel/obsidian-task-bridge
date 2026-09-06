# Sync Task Title

## Scenarios

### Scenario: Sync from Obsidian
- **GIVEN** there is a configured task source note
- **WHEN** a task is created in said file
- **THEN** a task with the same title is created in Todoist

### Scenario: Sync from Todoist
- **GIVEN** there is a task in Todoist
- **AND** that task is origianlly created by this plugin
- **WHEN** the title of that task changes
- **THEN** the title of the matching task in Obsidian is changed to the title of that task from Todoist

## Architecture

1. Besure to encapsulate any Todoist-specific code in it's own module.
2. The module shall have a generic interface to the rest of the plugin so that the connected task amangement provider may be changed without too much changes to this interface.
3. Write a basic integration tests against the Todoist API that ensures that the functionlity used by the plugin is still working as expected.

## Non-Features

1. There is no conflict resolution when syncing the title. The sync that comes last wins, regardless of when the change originally took place. Do it absolutely as simple a possible.
