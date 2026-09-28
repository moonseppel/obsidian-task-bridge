# Sync Task Deletion

## Scenarios

### Scenario: Delete from Obsidian
- **GIVEN** a task line was created by this plugin and is linked to a task in the task provider
- **WHEN** the line is deleted from the source note
- **THEN** the linked task in the task provider is deleted (or moved to trash, where the provider supports it)

### Scenario: Delete from the task provider
- **GIVEN** a task was created by this plugin and is linked to a line in the source note
- **WHEN** the task is deleted in the task provider
- **THEN** the linked line is removed from the source note

### Scenario: Sync Conflicts
- **GIVEN** a deletion and another change are synced together
- **WHEN** a sync conflict arises
- **THEN** the conflict is handled by the conflict resolution established in feature 5

### Scenario: A task moved out of the synced project is not deleted
- **GIVEN** a task created by this plugin is linked to a line in the source note
- **AND** the task no longer appears in the synced project's task list
- **WHEN** a sync pass looks the task up directly and finds it still exists, just in a different project
- **THEN** neither the task nor the note line is touched
- **AND** the link is left as it was, so the task is picked up again if it returns to the synced project

## Architecture

1. A block id missing from the note counts as deleted only after staying absent for 60 seconds across passes, the same debounce `firstSeenUnrecognized` already gives creation, since a vault-sync tool can briefly deliver a stale note.
2. A linked task missing from the project's fetched list is checked by a direct id lookup before any deletion: not found means genuinely deleted; found elsewhere means moved, and is left untouched with its link intact. Skipped once the note line is also already gone, since the outcome doesn't depend on the answer either way.
3. A deletion conflicts with a concurrent edit by the same recency rule Feature 5 already uses for titles — note `stat.mtime` versus task `updated_at`, local winning on a tie or a missing timestamp — rather than a separate rule.
4. Remote deleted, local title changed: no remote timestamp exists to compare, so local wins — the task is recreated from the line and re-linked.
5. Local line missing, remote title changed: compared against the note's overall last-modified time. Remote newer resurrects the line, appended with the task's current title; otherwise local wins and the task is deleted.
6. Line removal and appending a resurrected line are new note-edit capabilities, applied with the same `vault.process`-based safety net as today's replacements.

## Non-Features

1. A moved task is re-checked by direct lookup every pass for as long as it stays linked and out of the project — an accepted, deliberate inefficiency rather than remembering it was already found moved.
2. No confirmation is asked before a deletion this feature decides on, matching Feature 5's already-unattended orphan removal.
