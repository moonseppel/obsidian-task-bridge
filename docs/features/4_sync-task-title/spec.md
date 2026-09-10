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

### Scenario: Choose where tasks are created
- **GIVEN** the plugin has at least once connected to Todoist
- **WHEN** the user opens the settings of the plugin
- **THEN** the user can pick the project that synced tasks are created in
- **AND** the choice is offered as a search over the projects in the account

### Scenario: The Inbox is the default project
- **GIVEN** the user has never picked a project
- **WHEN** the connection to Todoist is established
- **THEN** the Inbox is selected on the user's behalf
- **AND** there is no way for the user to end up with no project selected

### Scenario: Configured project no longer exists
- **GIVEN** a project is configured
- **WHEN** that project is deleted in Todoist
- **THEN** syncing falls back to the Inbox rather than failing
- **AND** the new choice is persisted
- **AND** the user is informed once with an easy to understand message

### Scenario: Sync is triggered
- **GIVEN** a source note and a project are configured
- **WHEN** Obsidian starts
- **OR** the source note is changed and the user stops typing
- **OR** the configured polling interval elapses
- **OR** the user runs the sync command from the command palette
- **THEN** the sync runs in both directions

### Scenario: Choose how often the task manager is checked
- **WHEN** the user opens the settings of the plugin
- **THEN** the user can set how many minutes pass between checks
- **AND** a value outside the supported range is corrected to the nearest supported one
- **AND** an empty or unreadable field leaves the previous value untouched

### Scenario: The note is edited while a sync is running
- **GIVEN** a sync has read the source note and is writing its result back
- **WHEN** the user has changed one of those lines in the meantime
- **THEN** the user's version of that line is kept
- **AND** the rest of the sync is still written
- **AND** the changes the user currently does are also synced at some point

### Scenario: Hide the sync anchor
- **GIVEN** a task line has been synced and carries the anchor that identifies it
- **WHEN** the user reads or edits the note
- **THEN** the anchor is hidden from view
- **AND** the note on disk still contains it

### Scenario: Debug mode
- **GIVEN** the user opens the settings of the plugin
- **THEN** there is a general debug mode switch, off by default
- **WHEN** debug mode is turned on
- **THEN** the sync anchors become visible again
- **AND** debug logging appears in the developer console

## Architecture

1. The plugin shall work both in Obsidian desktop and mobile.
2. Besure to encapsulate any Todoist-specific code in it's own module.
3. The module shall have a generic interface to the rest of the plugin so that the connected task amangement provider may be changed without too much changes to this interface.
4. Write a basic integration tests against the Todoist API that ensures that the functionlity used by the plugin is still working as expected.
5. The integration tests against the Todoist API run as part of the normal test command and fail when no API token is present.
6. Debug mode is one general switch in the settings, off by default, and never a setting per feature. It gates both the visibility of the sync anchors and the plugin's debug logging, and any diagnostic added in a later feature hangs off this same switch rather than gaining a setting of its own.

## Non-Features

1. There is no conflict resolution when syncing the title. The sync that comes last wins, regardless of when the change originally took place. Do it absolutely as simple a possible.
2. Hiding the sync anchors in the editor also hides block identifiers that this plugin never wrote. Obsidian's editor gives no way to tell them apart, so this is accepted rather than worked around.
