# Complex Description

## Scenarios

### Scenario: A line no deeper than the task ends the description (R1)
- **GIVEN** a task line in Obsidian with a description
- **WHEN** a line follows whose `levelsBelowTask` is 0 or less, such as the empty line `""` after `\tThis should also be part…`, or `- [ ] not nested grandchild 2` after `\t\t\tHow confusing is that?!`
- **THEN** the description ends before that line, and that line is not part of it
- **AND** no later line is part of the description, whatever its level, such as `\tThis is not part of the description…`

- **GIVEN** a task line in Obsidian
- **WHEN** the line directly after it has a `levelsBelowTask` of 0 or less
- **THEN** the task has no description

### Scenario: End of file (R7)
- **GIVEN** a task line in Obsidian, with or without a description
- **WHEN** the note ends after it
- **THEN** the description ends at the end of the file, and a task line that is the note's last line has no description

### Scenario: Whitespace-only line (R2)
- **GIVEN** a task line in Obsidian
- **WHEN** a line holding only tabs or spaces follows with a `levelsBelowTask` of 1 or more, such as `\t` in the complex description
- **THEN** the description starts or continues with it, as a blank line inside the description
- **AND** an empty line, whose `indentLevel` is 0, ends the description instead (R1)

### Scenario: Text line (R3)
- **GIVEN** a task line in Obsidian
- **WHEN** a text line, a bullet included, follows with a `levelsBelowTask` of 1 or more, such as `\t- this is a bullet…`, `\t  This should still…` or `\tThis should not be part of the bullet…`
- **THEN** the description starts or continues with it

### Scenario: Checkbox line one level deeper (R4)
- **GIVEN** a task line in Obsidian
- **WHEN** a checkbox line follows with a `levelsBelowTask` of exactly 1 and no spaces directly after its tabs, such as `\t- [ ] nested child` directly after `- [x] Parent task`, or `\t- [ ] this is a nested task…` after the description of `- [ ] neuer task`
- **THEN** that line is a nested task of the task line, not part of its description
- **AND** a description open before it ends there

### Scenario: Checkbox line with spaces after its tabs (R5)
- **GIVEN** a task line in Obsidian
- **WHEN** a checkbox line follows with a `levelsBelowTask` of 1 or more and spaces directly after its tabs
- **THEN** the description starts or continues with it, as text
- **AND** that line is not a task

### Scenario: Checkbox line two or more levels deeper (R6)
- **GIVEN** a task line in Obsidian
- **WHEN** a checkbox line follows with a `levelsBelowTask` of 2 or more, such as `\t\t- [ ] direct grandchild` after `- [ ] another nesting test`
- **THEN** the description starts or continues with it, as text
- **AND** that line is not a task: it is not synced, is not a nesting parent, and its block id does not count as an anchored task line

### Scenario: Indentation on push
- **GIVEN** a task in Obsidian has a description
- **WHEN** the description is pushed to the task provider
- **THEN** exactly one indent level is removed from every description line, the task line's own indentation plus one tab, not all indentation the lines share
- **AND** `\t\t- [ ] direct grandchild` under a top-level task reaches the task provider as `\t- [ ] direct grandchild`

### Scenario: Indentation on pull
- **GIVEN** a task in the task provider has a description
- **WHEN** the description is pulled into Obsidian
- **THEN** one tab past the task line's indentation is added to every description line
- **AND** a description pushed and pulled again round-trips to identical lines

### Scenario: Already-synced task whose line becomes description text
- **GIVEN** a task was already synced from its own line, such as `\t\t- [ ] direct grandchild` under `- [ ] another nesting test`
- **AND** that line is now description text by R5 or R6
- **WHEN** the notes are synced
- **THEN** the line is not synced as a task
- **AND** its text is pushed in the description of the task it belongs to
- **AND** its task is not pulled back into the note as a new task line
- **AND** its block id no longer counts as an anchored task line, so its task is flagged after 60 minutes and removed 2 days later, as a task whose block id still exists outside scope

## Rules

### Names

| Name | Meaning |
|---|---|
| `taskLine` | The task line whose description is being decided, at any indent level |
| `currentLine` | The line being decided |
| `indentLevel` | Number of leading tabs; an empty line has `indentLevel` 0 |
| `levelsBelowTask` | `currentLine.indentLevel - taskLine.indentLevel` |
| `spacesAfterTabs` | Number of spaces directly after the leading tabs |
| `lineKind` | `whitespaceOnly` (only tabs or spaces), `checkbox` (list marker followed by `[x]`), `text` (everything else, bullets included) |

### Decision table

| # | `levelsBelowTask` | `lineKind` | Further condition | Directly after `taskLine` | Inside an open description | Example (test vault) |
|---|---|---|---|---|---|---|
| R1 | ≤ 0 | any | – | no description | END | `""` after `\tThis should also be part…`; `- [ ] not nested grandchild 2` after `\t\t\tHow confusing is that?!` |
| R2 | ≥ 1 | `whitespaceOnly` | – | description starts | continue; blank line inside | `\t` in the complex description |
| R3 | ≥ 1 | `text` | – | description starts | continue | `\t- this is a bullet…`, `\t  This should still…`, `\tThis should not be part of the bullet…` |
| R4 | 1 | `checkbox` | `spacesAfterTabs` = 0 | no description; nested task | END; nested task | `\t- [ ] nested child` after `Parent task`; `\t- [ ] this is a nested task…` in Another test note |
| R5 | ≥ 1 | `checkbox` | `spacesAfterTabs` > 0 | description starts; line is text | continue; line is text | – |
| R6 | ≥ 2 | `checkbox` | – | description starts; line is text | continue; line is text | `\t\t- [ ] direct grandchild` after `another nesting test` |
| R7 | – | end of file | – | no description | END | – |

- The line that triggers END is not part of the description.
- END is final: no later line re-enters, whatever its level (`\tThis is not part of the description…`).

## Architecture

1. Which lines after a task line form its description is decided from file content alone by the decision table, with `indentLevel` as the first decision parameter (architecture-rules.md #19).
2. Nesting and subtree boundaries follow R1 too, so the note keeps one boundary for descriptions and nesting (architecture-rules.md #24).
3. One classification of a note's lines, walked top-down, decides whether a checkbox line is a task; a checkbox line inside an open description by R5 or R6 is text everywhere a line is treated as a task (architecture-rules.md #39), while its block id still counts when minting a new one, so minting avoids collisions.
4. A description is pushed with exactly one indent level removed and pulled with one tab past the task line's indentation added, so it round-trips unchanged (architecture-rules.md #19).
5. A task's own block id is the last one in its provider description, since description text can now carry a `^block-id` of its own (architecture-rules.md #20).
6. An already-synced task whose line becomes description text needs no dedicated handling: its block id no longer counts as anchored, so the missing-line sweep takes over, and since Obsidian's metadata cache still indexes the id, it is treated as out of scope (architecture-rules.md #33); `RemoteChildSync` counts a child whose block id appears anywhere in the note, description text included, as already pulled in.

## Non-Features

1. A line indented with spaces only has `indentLevel` 0, and therefore neither starts a description nor nests.
2. An existing link whose description text changes by the one-level push indentation is pushed once on the next pass; there is no migration.
