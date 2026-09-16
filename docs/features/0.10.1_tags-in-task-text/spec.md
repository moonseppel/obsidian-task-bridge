# Tags in the Task Text

A tag is recognized wherever it stands in a task line's own text, not only where it trails it. This replaces Feature 0.7's Rule 5 and its Non-Feature 2.

## Scenarios

### Scenario: A tag in the middle of the text becomes a label
- **GIVEN** a task line whose own text carries a tag before its end, such as `- [ ] Call the #home dentist ^ots-a1b2c3`
- **WHEN** the task is synced
- **THEN** the provider task gets `home` as a label, exactly as a trailing tag already does
- **AND** the provider task's title is `Call the dentist`: the tag token is removed together with one adjoining space, and the rest of the text keeps its own spacing
- **AND** the note line is left exactly as it stands, tag included

### Scenario: Several tags in one line
- **GIVEN** a task line carrying more than one tag, at the start of its text, inside it, trailing it, or any mix
- **WHEN** the task is synced
- **THEN** every one of them becomes a label, in the order they appear in the line
- **AND** the title is what is left of the text once all of them are removed

### Scenario: A tag keeps its place in the note
- **GIVEN** a linked task line whose tag stands inside its text rather than trailing it
- **WHEN** a sync pass finds neither its title nor its tags changed on either side
- **THEN** the line is not rewritten and the tag stays exactly where it stands

### Scenario: A label added in the provider
- **GIVEN** a linked task line
- **WHEN** a label is added to its task in the provider and pulled
- **THEN** the tag is appended at the end of the line's own text, before the block id anchor, exactly as before this feature

### Scenario: A label removed in the provider
- **GIVEN** a linked task line carrying that tag inside its text rather than trailing it
- **WHEN** the label is removed in the provider and pulled
- **THEN** the tag token is removed from where it stands, together with one adjoining space
- **AND** the rest of the line's own text is left as it is

### Scenario: A title changed in the provider
- **GIVEN** a linked task line carrying one or more tags inside its text
- **WHEN** the task's title changes in the provider and is pulled
- **THEN** the line's own text becomes the pulled title followed by the line's tags, in the relative order they had, before the block id anchor
- **AND** a tag's position inside the previous text is not preserved, because the text it stood in no longer exists

### Scenario: What is a tag
- **WHEN** a title contains a `#` that stands at the very start of that text or directly after a space or a tab
- **AND** it's followed by it's body, which is one or more of: a letter or a digit in any script, an emoji, `_`, `-`, `/`
- **AND** said body is terminated by any other character, a line break, end of the text, a space or the blocke id anchor
- **AND** it does not solemly consist of digits
- **AND** it is not between two backticks on the same line, suchs as `#tag`
- **THEN** it is recognized as a tag

### Scenario: What is not a tag
- **GIVEN** a task line's own text
- **WHEN** a `#` is present
- **AND** is not recognized as a tag
- **THEN** the text is left untouched

### Scenario: A tag in description text
- **GIVEN** a task's description lines carry a `#tag`
- **WHEN** the task is synced
- **THEN** that text is pushed as part of the description, unchanged, and never becomes a label
- **AND** it never affects the task line's own title or labels

### Scenario: The tag filter sees a tag anywhere
- **GIVEN** a source tag is configured in the settings
- **WHEN** a task line carries that tag anywhere in its own text
- **THEN** the line is in scope
- **AND** this adds on to the feature that only a trailing one put it in scope

### Scenario: A task whose line falls out of the tag filter
- **GIVEN** a linked task line that carries the configured source tag
- **WHEN** the tag is taken off that line, or a source tag is set to a tag that the line does not carry
- **THEN** the line stops counting as a task line the run found, exactly as if it stood in no scanned note at all
- **AND** its task follows the established out-of-scope removal lifecycle for orphaned tasks

- **WHEN** an oprhaned task get the configured tag back or is but back in sync scope due to anyo ther reason
- **THEN** it is treated exactly as a re-linked orphan would be treated

### Scenario: A line still out of tag scope after its task was removed
- **GIVEN** a task line whose tag no longer matches and whose task has been removed
- **WHEN** later runs sync the note
- **THEN** the line is left alone and no task is created for it

### Scenario: A line linked before this feature
- **GIVEN** a link whose last agreed title still holds a tag as part of its text, such as `Call the #home dentist`
- **WHEN** the note is synced after this feature
- **THEN** the title and the labels are pushed once, so the provider task's title loses the tag text and gains the label
- **AND** the note line is not rewritten by that push
- **AND** a conflicting remote change on the same field is resolved by the established recency rule, as for any other push

### Scenario: Round trip
- **GIVEN** a task line carrying tags anywhere in its text
- **WHEN** it is pushed and nothing changes on either side
- **THEN** a later pass reads the same title and the same tags, and writes nothing to the note

## Non-Features

1. A tag's position inside the text is not preserved across a pulled title change; it moves to the trailing position, since the text it stood in is replaced wholesale.
2. A tag in description text is not synced as a label, in either direction.
3. An escaped `\#` is not interpreted; it is read as a tag exactly as Obsidian reads it.
4. Tags are compared exactly as today, case-sensitively and as a set, even though Obsidian treats two tags differing only in case as one.
5. There is no migration: a link whose last agreed title still carries the tag text pushes that difference once on the next pass.
