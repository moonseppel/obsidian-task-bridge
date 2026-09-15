# Add Nested Tasks

## Scenarios

### Scenario: Add Nested Tasks
- **GIVEN** a task in Obsidian has tasks below a task that are at least one level deeper
- **THEN** these tasks are synced as sperate tasks and all rules for tasks apply
- **AND** the task is synced as a nested task to the task provider
- **AND** this behavior is recursive for nested tasks further down the tree

- **WHEN** a task in the task provider has a nested task
- **THEN** the nested tasks are synced as sperate tasks and all rules for tasks apply
- **AND** the task in Obsidian also gets the nested tasks as tasks below the main task with an indention one level deeper
- **AND** this behavior is recursive for nested tasks further down the tree

- **WHEN** a nested task looses its parent
- **THEN** the task becomes it's own task without a parent on the other side of the sync, too
- **AND** all taks below still are sub-tasks of this task

### Scenario: Sync Conflicts
- **GIVEN** parent or nested tasks are synced between the task provider and Obsidian
- **WHEN** a sync conflit arises
- **THEN** the conflict is handled by the established conflict resolution

## Architecture

1. Nesting is derived from indentation every pass, never stored declaratively on a line: a task's parent is its nearest ancestor task line, found the same way a description block already is, with one addition — a blank line closes every open ancestor, so the note has one nesting boundary rather than two.
2. A task's full subtree (its description and every nested descendant, at any depth) generalizes the description-only span Feature 7 already computed; it decides where a new nested child is inserted and what moves together when a task is relocated.
3. Pushing relies on a single-pass, top-down ordering invariant: a parent's line always precedes its children's, so a parent created earlier in the same pass is already linked by the time its children are reached, at any depth.
4. A sub-task added directly in the provider, under a task this plugin already links, is pulled into the note as a new indented line — a deliberate, narrow exception to only ever syncing an Obsidian-originated task. A task with no linked ancestor anywhere in its chain is still never pulled in.
5. A task's parent is compared independently, the same way every other field is, against what both sides last agreed on; a genuine conflict resolves by Feature 5's recency rule.
6. Pushing a reparent (to a specific task, or to none) never touches the note. Pulling a cleared parent only reindents the line in place. Pulling a reparent to a specific new parent removes the line's whole subtree from its old position and reinserts it, reindented, under the new parent's existing content.
7. Multiple unrelated pulls can target the same anchor line in one pass (a new remote child and a relocated task both landing under the same parent); insertions are queued and flushed into one edit per anchor at the end of the pass rather than racing to overwrite each other.
8. Removing a task first reparents its still-linked children to top-level, never recursively, since Todoist cascades a delete to every descendant and a grandchild's own parent is the child being spared, not the task being removed.

## Non-Features

1. An already-linked task's line is never left un-anchored during a relocation: the anchor moves with the task, its description and nested children intact.
2. A task's own indentation depth is not itself synced as a number; only its immediate parent identity is, so an intermediate level with no Obsidian-linked task anywhere in it is not reconstructed.
3. Priority is Feature 12's concern, alongside the rest of the Tasks-plugin-sourced fields.
