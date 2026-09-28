# Description Integrity

A task's description survives a sync intact: the indentation it was written with, every part of it,
and the footer that identifies which task it belongs to.

## Scenarios

### Scenario: A description line two levels deep stays where it is
- **GIVEN** a note contains these two lines, the second indented with one tab followed by four spaces, at a tab size of 4

```
- [ ] another nesting testji
	    - [ ] direct grandchild, now take a look at that #tag
```

- **WHEN** the note is synced, and synced again with nothing changed on either side
- **THEN** the second line still reads exactly as it did, its indentation included
- **AND** it is still the first line's description text, not a task of its own
- **AND** exactly one task exists in the provider

### Scenario: No part of a description is lost
- **GIVEN** a task whose provider description carries text after the block-id footer
- **WHEN** the task is synced
- **THEN** that text is part of the task's description like any other part of it
- **AND** no later sync drops it or overwrites it

### Scenario: The block id is found wherever the footer stands
- **GIVEN** a task whose provider description carries the TaskBridge id somewhere other than its last line
- **AND** there is no other tesk, that exactly matches the TabkBridge id's format
- **WHEN** the task's block id is read
- **THEN** it is the TaskBrdige id, never one belonging to the description's own text

- **GIVEN** a task whose provider description carries the TaskBridge id somewhere other than its last line
- **AND** there is another tesk, that exactly matches the TabkBridge id's format
- **WHEN** the task's block id is read
- **THEN** it is a TaskBrdige id, never one belonging to the description's own text
- **AND** it may be condfused with the other id of the exact required format, because it's impossible to tell them apart

## Architecture

1. The footer is found by searching for the longest part of it that never varies — the label, the caret and the plugin's own block-id prefix, `TaskBridge ID: ^tb-` — never by its position in the description, and never by matching a bare `^id`, which the description's own text may also carry.
2. What a provider does to a description it is given — trimming it, say — is the provider's own knowledge, declared in the provider module rather than assumed by the sync engine. So when comparing the descriptions from the provider and Obsidian, any preproessing is determined by the provider module, fallback is no preprosessing.
