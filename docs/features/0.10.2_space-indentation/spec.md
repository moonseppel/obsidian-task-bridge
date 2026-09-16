# Space Indentation

An indent level is a tab or a complete run of as many spaces as Obsidian's tab size, wherever Feature 0.10 counts leading tabs. Nothing else about the decision table changes.

## Scenarios

### Scenario: The tab size comes from Obsidian
- **GIVEN** the vault's editor tab size is set to a number of spaces
- **WHEN** a note is synced
- **THEN** exactly that many spaces count as one indent level wherever a tab counts as one
- **AND** the value is read fresh at the start of every sync run, so changing the setting takes effect without reloading the plugin
- **AND** a tab size that cannot be read, or is not a positive whole number, is treated as 4

### Scenario: A space-indented continuation line belongs to the description
- **GIVEN** a tab size of 4, a task line `- [ ] Test for complex description` and, below it, `\t- this is a bullet point in the description.` followed by a line indented with six spaces
- **WHEN** the description is read
- **THEN** the six-space line has an `indentLevel` of 1, so it is one level below the task and continues the description
- **AND** the description continues past it, by the unchanged decision table, up to the first line no deeper than the task line

### Scenario: How leading whitespace is counted
- **GIVEN** a line's leading whitespace and a tab size of N
- **WHEN** its indent level is counted
- **THEN** the whitespace is read from left to right, a tab counting as one level, and every complete run of N spaces counting as one level
- **AND** spaces left over after the last complete run are not a level
- **AND** a run of fewer than N spaces that is followed by a tab contributes nothing: the tab is one level and the spaces are discarded with it
- **AND** an empty line still has an `indentLevel` of 0, so it still ends a description

### Scenario: Leftover spaces still mark a checkbox line as text
- **GIVEN** a checkbox line one level below a task line, with spaces left over after its last complete indent level, such as a tab followed by two spaces at tab size 4
- **WHEN** the note's lines are classified
- **THEN** it is description text and not a task, exactly as before this feature

### Scenario: A space-indented checkbox line is a nested task
- **GIVEN** a tab size of 4, a task line and, directly below it, a checkbox line indented with exactly four spaces and nothing left over
- **WHEN** the note's lines are classified
- **THEN** it is that task's nested task, exactly as a tab-indented one is

### Scenario: Pushing a description indented with spaces
- **GIVEN** a description whose lines are indented with spaces, tabs, or both
- **WHEN** it is pushed to the provider
- **THEN** exactly one indent level is removed from every line, the task line's own levels plus one, whether each of those levels is written as a tab or as a run of spaces
- **AND** spaces left over after the removed levels survive, so a line's depth relative to the block is preserved
- **AND** a six-space line under a top-level task reaches the provider with two spaces at tab size 4, as does a line written as a tab followed by two spaces

### Scenario: Pulling a description normalizes space indentation once
- **GIVEN** a description line in the note indented with spaces
- **WHEN** a remote change to that description is pulled
- **THEN** the line is written with one literal tab past the task line's indentation, followed by whatever the provider's line carries
- **AND** its indent level is the same as before, while its bytes are not
- **AND** a later push and pull leave it unchanged, so the normalization happens at most once per line

### Scenario: Nesting and subtrees follow the same count
- **GIVEN** task lines indented with spaces, tabs, or both
- **WHEN** parents, subtree spans and description boundaries are derived
- **THEN** all of them use the same indent level count, so the note keeps one boundary rule rather than two

## Rules

### Names

These two rows replace their counterparts in `docs/features/0.10_complex-description/spec.md`. Every other name, and the whole decision table, is unchanged.

| Name | Meaning |
|---|---|
| `indentLevel` | Number of indent levels in the leading whitespace, read left to right: one per tab, one per complete run of `tabSize` spaces; an empty line has `indentLevel` 0 |
| `spacesAfterTabs` | The spaces left over after the last complete indent level |

### Worked examples at a tab size of 4

| Leading whitespace | `indentLevel` | `spacesAfterTabs` |
|---|---|---|
| `\t` | 1 | 0 |
| `\t\t` | 2 | 0 |
| 4 spaces | 1 | 0 |
| 6 spaces | 1 | 2 |
| 8 spaces | 2 | 0 |
| 2 spaces | 0 | 2 |
| `\t` + 2 spaces | 1 | 2 |
| 2 spaces + `\t` | 1 | 0 |
| `\t` + 4 spaces + `\t` | 3 | 0 |

## Architecture

1. An indent level is a tab or a complete run of `tabSize` spaces, everywhere the decision table counts one (amends architecture-rules.md #19 and #39).
2. The tab size is Obsidian's own editor setting, read through one narrow seam and validated, since it is not part of the documented plugin API; it is injected into the code that counts indentation rather than read there, so that code stays free of Obsidian.
3. The tab size is read once per sync run and carried through the run, so one run cannot count two lines of the same note by two different rules.
4. A description is pushed with one indent level removed per line whatever each level is written as, and pulled with one literal tab past the task line's indentation, so an already-tab-indented line still round-trips byte for byte.

## Non-Features

1. A run of fewer than `tabSize` spaces is not a level, so a line indented with two spaces under a top-level task at a tab size of 4 is still not part of its description.
2. Pulling still writes a literal tab; matching a vault that indents with spaces is out of scope, and the pulled line's indent level is the same either way.
3. Obsidian's "use tabs" setting is not read: both styles are accepted on the way in regardless of which one the vault writes.
4. The decision table's R4 and R6 are untouched: a checkbox line two or more levels below its task line is still description text, not a nested task.
5. There is no migration: a description whose pushed bytes change under the new count is pushed once on the next pass.
6. A changed tab size takes effect on the next sync run; nothing is re-scanned or re-pushed eagerly because of it.
