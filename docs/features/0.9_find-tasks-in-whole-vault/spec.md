# Find Tasks in Whole Vault

## Scenarios

### Scenario: Select whole vault as task source
- **WHEN** the user enters the settings
- **THEN** show a "Sync the whole vault" checkbox, off by default
- **AND** checking it disables the note-or-folder field rather than hiding it, so the alternative stays visible
- **AND** with the checkbox off and the field empty, no tasks are synced, exactly as before this feature

### Scenario: Select a note or a folder as task source
- **GIVEN** the whole-vault checkbox is off
- **WHEN** the user types into the note-or-folder field
- **THEN** offer a fuzzy search over both notes and folders in the vault
- **AND** selecting a note syncs only that note, as today
- **AND** selecting a folder syncs every markdown note under it, recursively

### Scenario: Filter by tag
- **WHEN** the user enters a tag in the settings
- **THEN** only task lines carrying that tag are synced, on top of whatever the note, folder or whole-vault field resolves to
- **AND** the tag field offers existing vault tags as suggestions but also accepts a tag not yet used anywhere
- **AND** leaving the tag field empty applies no tag filter

### Scenario: Ignore a file name pattern
- **WHEN** a third-party sync tool syncs the Obsidian vault between devices
- **AND** this tool creates files with a certain name pattern on conflicts
- **THEN** allow the user to put a file name pattern in the settings, always visible and editable
- **AND** ignore files matching this pattern when scanning a folder or the whole vault
- **AND** never exclude a note the user explicitly selected as the single source, even if it matches the pattern
- **AND** show a warning next to the pattern when the one explicitly selected note matches it, saying the pattern will not take effect on that note

### Scenario: Task or note moved within scope
- **GIVEN** a task, or the note containing it, is moved
- **WHEN** the task is still inside the configured scope
- **THEN** update the task's tracked location to the new one
- **AND** do not create a new block id

### Scenario: Task or note moved out of scope
- **GIVEN** a task, or the note containing it, is moved
- **WHEN** the task is no longer inside the configured scope, but its block id still exists in some other non-ignored vault file
- **THEN** treat it the same way an orphaned task is treated: flag it with a removal notice after the usual orphan flag delay, and remove it after the usual orphan removal grace period
- **AND** re-entering scope before removal resolves it exactly as re-linking resolves an orphan

### Scenario: Task genuinely deleted
- **GIVEN** a linked task's block id is no longer found in the note it was last seen in
- **WHEN** that block id is not found in any other non-ignored vault file either
- **THEN** resolve it the same way a deleted line is resolved today (Feature 6), unchanged by this feature

## Architecture
1. The code that resolves and reacts to the task source lives in one module, split into a submodule that finds which tasks are currently in scope, and a submodule that listens for vault changes and triggers a sync.
2. Scope is derived fresh every pass from three independent, composable settings — the configured note, folder, or whole vault; an optional tag; an ignore-file pattern — never stored declaratively.
3. See `docs/features/architecture/architecture-rules.md` rules 29–33 for the general invariants this feature adds.
