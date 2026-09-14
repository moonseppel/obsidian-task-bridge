# Add More Fields

## Scenarios

### Scenario: Add State
- **WHEN** a task is synced
- **THEN** the task in the task provider also gets the task state from Obsidian

- **WHEN** a task is synced
- **THEN** the task in Obsidian also gets the task state from taks provider

### Scenario: Add Description
- **GIVEN** a task in Obsidian has text below it that is indented at least one level deeper than the task itself
- **WHEN** the task is synced
- **THEN** the task in the task provider also gets a description that matches the indented text without the indention level of the task

- **GIVEN** a task in the task provider has a description
- **WHEN** the task is synced
- **THEN** the task in Obsidian also gets a text below the task indented one level deeper as the task that matches the description

### Scenario: Add Tags
- **GIVEN** a task in Obsidian has a tag
- **WHEN** these changes are synced
- **THEN** the task in the task provider also gets the tag from Obsidian as label

- **GIVEN** a task in the task provider has a label
- **WHEN** these changes are synced
- **THEN** the task in Obsidian also gets the label from the taks provider as tag

### Scenario: Sync Conflicts
- **GIVEN** any of the new fields is synced between the task provider and Obsidian
- **WHEN** a sync conflit arises
- **THEN** the conflict is handled by the established conflict resolution

## Architecture

1. State is binary (done/not done) from a single non-space checkbox character; richer states are Feature 10's concern.
2. A linked task missing from Todoist's active list is checked directly, as Feature 6 already does, adding a third outcome to deleted/moved: still present but completed, which pulls into the checkbox.
3. A description is text indented one level deeper than its task, excluding nested task lines, dedented for Todoist and re-indented by one tab on return.
4. A task's Todoist description holds the user's text, a blank line, then this plugin's footer, found by search per architecture-rules.md #8, never by position.
5. A tag is recognized only trailing the task text, before the block id; it becomes a label on Todoist, stripped from the title-equivalent content, and round-trips to the same spot.
6. Every new field is compared independently against what both sides last agreed on for it; a genuine conflict resolves by Feature 5's recency rule.
7. Flagging or un-flagging an orphan preserves the task's current user-authored description; only the footer and notice are rewritten.

## Non-Features

1. A checkbox state other than space or a completion marker is treated as done — a placeholder pending Feature 10.
2. A tag written anywhere but trailing the task line is left as plain text, not synced.
3. A Todoist label that cannot be written as an Obsidian tag is left unsynced, not re-encoded.
4. An orphaned task Todoist marks completed drops out of orphan tracking while completed, since tracking walks the same active list as everything else; reopening it resumes tracking from a fresh clock. Reaching orphan tracking into completed tasks is out of scope.
5. Priority moved to Feature 11.
