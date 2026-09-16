# Space Indentation

An indent level is a tab or a complete run of as many spaces as Obsidian's tab size, wherever Feature 0.10 counts leading tabs. Nothing else about the decision table changes.

## Scenarios

### Scenario: Spaces Count as Tab for Indention Levels
- **GIVEN** the vault's editor tab size is set to a number of spaces
- **WHEN** a note is synced
- **THEN** exactly that many spaces count as one indent level wherever a tab counts as one
- **AND** the value is read fresh at the start of every sync run, so changing the setting takes effect without reloading the plugin
- **AND** a tab size that cannot be read, or is not larger than 0, is treated as 4
- **AND** the plugin behaves the same, ragrdless whether an indention level comes from multiple spaces or a tab

### Scenario: How leading whitespace is counted
- **GIVEN** a line's leading whitespace and a tab size of N
- **WHEN** its indent level is counted
- **THEN** the whitespace is read from left to right, a tab counting as one level, and every complete run of N spaces counting as one level
- **AND** spaces left over after the last complete run are not a level
- **AND** a run of fewer than N spaces that is followed by a tab contributes nothing: the tab is one level and the spaces are discarded with it
- **AND** an empty line still has an `indentLevel` of 0, so it still ends a description

### Scenario: Leftover spaces counting
- **GIVEN** an indent level is computed of spaces or tabs
- **WHEN** there are elftover space after the indent level
- **THEN** these are not removed, but count as before


## Rules

### Names

These two rows replace their counterparts in `docs/features/0.10_complex-description/spec.md`. Every other name, and the whole decision table, is unchanged.

| Name | Meaning |
|---|---|
| `indentLevel` | Number of indent levels in the leading whitespace, read left to right: one per tab, one per complete run of `tabSize` spaces; an empty line has `indentLevel` 0 |
| `spacesAfterTabs` | The spaces left over after the last complete indent level |

## Architecture

1. The computation of the indent level should be encapsuled in one place. For the rest of the code it should not matter if the ident level is made up from spaces or tabs.

## Non-Features

1. There is no migration: a description whose pushed bytes change under the new count is pushed once on the next pass.
2. A changed tab size takes effect on the next sync run; nothing is re-scanned or re-pushed eagerly because of it.
3. A soft-break continuation directly under a top-level task line is only half a level at tab size 4 — Obsidian writes two spaces — so it stays `indentLevel` 0 and outside the description; the same keystroke one level deeper, six spaces under a `\t` bullet, is one level and is inside it.
