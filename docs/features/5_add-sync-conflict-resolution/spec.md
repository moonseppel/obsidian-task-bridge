# Add Conflict Resolution

## Scenarios

### Scenario: Sync Conflict Resolution
- **GIVEN** there are changes in Obsidian and Todoist
- **AND** these changes affect the same field
- **AND** these changes are conflicting
- **WHEN** these changes are synced
- **THEN** the conflict is solved automatically
- **AND** the risk for the user to manually solve is kept at a minium

### Scenario: Multiple Device Sync
- **GIVEN** The user has multiple devices, desktop and mobile mixed
- **WHEN** a sync conlfict occurs
- **THEN** the conflict is solved automatically
- **AND** the risk for the user to manually solve is still kept at a minium

### Scenario: Vault Sync Between DEvices
- **GIVEN** The user has multiple devices, desktop and mobile mixed
- **AND** the vaults are synced on a file basis between them by a third party application
- **WHEN** a sync conlfict occurs
- **THEN** the conflict is solved automatically
- **AND** the risk for the user to manually solve is still kept at a minium

### Scenario: An orphaned task is flagged before it is removed
- **GIVEN** a task in the task provider carries this plugin's block id in its description
- **AND** the plugin's stored data does not currently link that block id to this task
- **AND** that has been true for at least 60 minutes
- **WHEN** a sync pass runs
- **THEN** the task's description is updated to say it was created by this plugin, is now
  orphaned, has no matching task in Obsidian, and will be removed in 2 days
- **AND** the plugin records that removal date for the task in its own stored data

### Scenario: A flagged orphan is removed on schedule
- **GIVEN** a task has been flagged as an orphan
- **AND** its recorded removal date has passed
- **WHEN** a sync pass runs
- **THEN** the task is moved to trash in the task provider, or permanently deleted where the provider offers no trash
- **AND** the plugin's stored record of the flag is cleared

### Scenario: A flagged orphan resolves itself
- **GIVEN** a task has been flagged as an orphan
- **WHEN** a sync pass finds the plugin's stored data now links that task to its block id after all
- **THEN** the flag is cleared
- **AND** the description notice is removed

## Architecture

1. A Todoist task created by this plugin carries the Obsidian block id that created it, appended as the last line of the task's description and prefixed with a human-readable label ("Obsidian Task Sync ID: ") so it means something to a user looking at the task in the provider rather than reading as unexplained noise. The description may be freely edited afterward, so the block id is found by searching the description rather than assuming its position.
2. A line whose block id is not yet recognized by `data.json` is not immediately treated as a new, unsynced task. The task list is checked first for a task whose description already carries that block id, and that task is re-linked instead of a new one being created. Only once the block id has stayed unrecognized and unmatched for a short grace period of 60 seconds is a new task actually created — so a vault-sync tool delivering `data.json` slightly behind the note does not produce a duplicate.
3. A freshly minted block id also carries a short random tag unique to the device that minted it. That tag is generated once per device and kept in storage that stays on the device — never in `data.json`, since that file is exactly what a vault-sync tool would otherwise propagate between devices. This makes the same block id string vanishingly unlikely to be minted independently by two different devices, not only within the one note a single device happens to be reading.

## Non-Features

1. The task's description is a courtesy notice only. The plugin's own stored data, never the description text, decides whether a task is flagged as an orphan and when it is removed.
2. A task line removed from the source note is not covered here — the note and the task provider are not reconciled that way in this feature. That, and a task removed on the provider's side reaching back into Obsidian, are full two-way deletion sync, planned for feature 6.
