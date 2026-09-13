# Obsidian Task Sync

An Obsidian plugin that synchronizes task checkboxes between Obsidian notes and a cloud task management platform.

## Features

- **Partial two-way sync**: All Obsidian tasks are pushed to the task manager; tasks that originated in Obsidian sync back two-way
- **Non-commercial open-source**: Licensed under AGPL-3.0-or-later
- **Error handling**: Explicit failure reporting with user-friendly notifications
- **Mobile access**: Manage tasks from anywhere via your task manager

## Status

**Feature 1: Complete** — "Hello World" plugin: lifecycle hooks, error handling, and build infrastructure (esbuild, TypeScript strict mode, Jest testing).

**Feature 2: Complete** — Select a single source note in settings: a fuzzy note picker in the plugin settings, the selection persists across restarts, follows the note when it is renamed or moved, and is cleared (with a notice) when the note is deleted.

**Feature 3: Complete** — Establish the Todoist connection: pick a Todoist API token in the settings, the connection is established when Obsidian starts, and a "Test connection" button reports the current state. Todoist-specific code lives behind a provider-neutral interface, and an integration suite checks the live Todoist API.

**Feature 4: Complete** — Sync task titles both ways: a checkbox line in the source note becomes a
Todoist task, and a title changed in Todoist is written back into the note. Tasks are anchored with
Obsidian block ids, syncing runs on save and on a configurable poll, and "Sync now" is in the
command palette.

**Feature 5: Complete** — Conflict resolution and task identity: a genuine conflict, where both
sides changed to different titles, is resolved by recency when both sides' modification times are
known, and deterministically favors the Obsidian edit when they aren't. Every task this plugin
creates carries the originating block id in its Todoist description, so a line whose link is
missing or stale re-links to that task — after a short grace period — instead of creating a
duplicate, and a short tag unique to each device keeps two devices from ever minting the same
block id. A task that loses its link is flagged as orphaned after an hour and removed after two
days unless it is re-linked first.

**Feature 6: Complete** — Task deletion sync: deleting a task line locally removes its linked
Todoist task, and deleting a task in Todoist removes its linked line, each after a short grace
period that gives a lagging vault-sync tool a chance to catch up first. A task moved to a different
Todoist project is left untouched rather than treated as deleted. A deletion that conflicts with a
concurrent edit on the other side is resolved by the same recency rule as a title conflict, except
the newer edit resurrects what the older side deleted instead of the edit being silently lost.

**Feature 7: Complete** — State, description and tags sync both ways, alongside title: checking a
box completes the Todoist task and vice versa; text indented under a task becomes its Todoist
description, and back; a trailing `#tag` becomes a Todoist label, and back. Each field is compared
and resolved independently, by the same rules already established for title, and a task Todoist
shows as completed is now told apart from one that was deleted or moved to another project.
Priority moves to a later feature alongside the rest of the Tasks-plugin-sourced fields.

**Feature 8: Complete** — Nested tasks: a task indented under another syncs as its sub-task in
Todoist, and a Todoist sub-task syncs into the note as an indented line, recursively at any depth.
A task that loses its parent — on either side — becomes a standalone task on both, by the same
recency rule as every other field, and a sub-task added directly under an already-synced task in
Todoist is pulled in too, even though it didn't originate in Obsidian.

**Feature 9: Complete** — Finding tasks across the vault: the task source can be a single note, a
folder with everything under it, or the whole vault, optionally narrowed to task lines carrying a
tag. File name patterns can be ignored, such as the conflict copies a third-party sync tool leaves
behind. A task whose line moves out of scope is flagged and eventually removed like an orphan,
rather than deleted outright.

Next: Feature 11 — due dates, recurrence and more fields sourced from the Tasks plugin.

## Connecting to Todoist

Requires Obsidian 1.11.4 or newer, which is where Obsidian's secret storage arrives.

1. In Todoist, go to **Settings → Integrations → Developer** and copy your API token.
2. In Obsidian, open **Settings → Obsidian Task Sync**.
3. Next to **API token**, add the token as a secret and select it.

The token is held in Obsidian's secret storage, never in the plugin's `data.json`. That storage is
local to the vault on each device, so the token has to be entered once per device — the upside is
that it is not carried along by vault sync, backups, or a git repository.

## How syncing works

Choose which tasks to sync and a Todoist project in the settings, and every checkbox line in scope
is kept in step with a task in that project.

```markdown
- [ ] Buy milk #errands ^ots-a1b2c3
	Oat milk, not regular
- [x] Call the dentist ^ots-d4e5f6
```

The `^ots-...` suffix is an ordinary Obsidian block identifier. The plugin appends it the first time
it syncs a line, and it is what ties that line to its Todoist task, so the title can change on
either side without the link breaking. `[[Tasks#^ots-a1b2c3]]` links to that task from anywhere in
the vault, and uninstalling the plugin leaves valid Obsidian markup behind.

Checking the box completes the Todoist task, and completing it in Todoist checks the box. Text
indented one level under a task line is its Todoist description; a trailing `#tag`, right before the
anchor, is a Todoist label. A task indented one level under another is its Todoist sub-task. All
five fields — title, state, description, tags, parent — sync both ways and independently of each
other. See [Nested tasks](#nested-tasks) for how nesting itself works.

The anchor is hidden in reading view unless **Debug mode** is on; Live Preview always shows it. See
[Debug mode](#debug-mode) for why.

A sync runs when the plugin loads, ten seconds after you stop editing a note in scope, on the poll
interval, and whenever you run **Sync now** from the command palette. Editing a note while a sync is
already running schedules another pass, so a change made in that window is not left waiting for the
next poll.

### Which tasks are synced

- **Note or folder** — a note syncs just that note; a folder syncs every note under it, however deeply nested
- **Sync the whole vault** — syncs every note in the vault; the note or folder field stays visible but disabled while this is on
- **Tag** — only task lines carrying this trailing `#tag` are synced, on top of whichever of the above applies; leave it empty to sync every task in scope
- **Ignore file patterns** — comma-separated file names skipped when scanning a folder or the whole vault, such as the conflict copies a third-party sync tool creates; `*` matches any run of characters, and matching ignores case

A note you selected explicitly is always synced, even if an ignore pattern matches it, and the
settings warn you when that happens. Scope is worked out fresh on every sync. The configured note or
folder is followed when it is renamed or moved, and cleared with a notice when it is deleted.

A task line that moves out of scope — into a note outside the configured folder, or into an ignored
file — is not treated as deleted. Its Todoist task is flagged and removed on the same schedule as an
[orphaned task](#orphaned-tasks), and picked up again if the line comes back into scope first.

### Which project tasks go to

Your Inbox, until you choose otherwise. The project list is remembered in `data.json`, so the
picker still offers your projects when you are offline. It is refreshed only when you open the
settings, change the API token, or press **Test connection**. The project setting starts on the
Inbox as soon as the connection is established, and picking a suggestion is the only way to change
it, so it can never be left empty. A sync therefore never stalls for want of a project.

If the project you chose is later deleted in Todoist, syncing falls back to the Inbox, remembers
that, and tells you once so the change is never silent.

### What wins when both sides changed

Title, state, description, tags and parent are each judged on their own: a conflict on one field
never affects what happens to another. A change on only one side always wins outright: it is pushed
or pulled, no contest. When both sides changed a field since they last agreed, and to different
values, it is a genuine conflict, and the newer edit wins — the note's modification time against
the Todoist task's. When recency can't be told, because the remote timestamp is missing or the two
are exactly equal, the Obsidian edit wins, deterministically, so the outcome never flips back and
forth from one sync to the next. When both sides happened to change a field to the *same* value,
there is nothing to reconcile and neither side is touched.

### Task identity and duplicate avoidance

Every task this plugin creates carries the block id that created it as the last line of its
Todoist description, findable even if you add your own notes to the description afterward. If a
line's block id isn't yet recognized, the project's task list is checked first for a task whose
description already carries that id — and re-linked to it — before a new one is created, and even
then only after 60 seconds of the id staying unmatched. That grace period is what keeps a
vault-sync tool that delivers `data.json` slightly behind the note from creating a duplicate task.
A short tag generated once per device and kept out of `data.json` is baked into every block id this
device mints from then on, so the same id is never minted independently by two devices.

### Orphaned tasks

A task that carries this plugin's block id but has no live link back to it — because the line was
edited out from under it, or `data.json` was reset — is orphaned. After an hour, its description is
updated with a notice that it will be removed in two days, and that date is recorded in the
plugin's own data, never read back from the notice text. If it is re-linked before then, the notice
is reverted and nothing more happens; otherwise it is removed once the date passes.

### Task deletion

Deleting a task line in a note removes its linked Todoist task; deleting a task in Todoist removes
its linked line. Either way, the deletion is only acted on once it has held for 60 seconds across
passes, the same grace period creating a task already gives a lagging vault-sync tool. Moving a task
to a different Todoist project is not treated as a deletion: the line and the link are both left
exactly as they are, and are picked up again if the task ever moves back. A deletion that conflicts
with a concurrent edit on the other side is resolved by the same recency rule as a title conflict,
except the newer edit resurrects what the older side deleted — recreating the task from an edited
line, or re-appending a line (at the end of the note it was last seen in) from an edited task —
instead of the edit being silently lost. Deleting a task that still has synced sub-tasks does not
take them down with it: they are promoted to top-level in Todoist first, since Todoist itself would
otherwise delete every descendant of a removed task along with it.

### Nested tasks

A task indented at least one level under another syncs as that task's sub-task in Todoist, and a
sub-task in Todoist syncs into the note as a line indented one level under its parent — recursively,
so a whole tree of tasks nests the same way on both sides.

```markdown
- [ ] Plan the trip ^ots-a1b2c3
	- [ ] Book flights ^ots-d4e5f6
	- [ ] Book hotel ^ots-g7h8i9
```

Which task is a line's parent is read fresh from indentation every sync, never stored as a separate
setting, so moving a task to a different indentation level moves it to a different parent in
Todoist too, on whichever side the change was made. A task that loses its parent entirely — its
line is unindented, or its Todoist parent is cleared — becomes a standalone task on the other side
as well, while whatever is nested under it stays exactly where it is. A sub-task added directly in
Todoist, under a task already synced from Obsidian, is pulled into the note too; a task created
directly in Todoist with no synced task anywhere above it in its chain still isn't.

## Debug mode

One switch in the settings, off by default, for when something needs diagnosing. It does two things:
it reveals this plugin's `^ots-` anchors in reading view, and it prints this plugin's debug logging
to the developer console.

Reading view offers no CSS hook for a block identifier, so while debug mode is off the plugin edits
the rendered text instead, matching on the `ots-` prefix. Only its own anchors are touched, and only
the rendered copy: the note on disk keeps its anchor. This applies as views are drawn, so a reading
view that is already open may need reopening after you flip the switch. Obsidian itself swallows a
block identifier that terminates a block, which is what the last item of a list does; those never
reach the page, so no setting can reveal them there.

Live Preview shows the anchors on every task line regardless of this setting. Hiding them only on
the lines the cursor is not on made the end of a line jump around as the cursor moved onto and off
of it.

## Known limitations

- Any checkbox character other than a space counts as done, so a custom state such as `[/]` or `[-]` syncs as a completed task
- A line resurrected from a Todoist edit is appended as a plain `- [ ]` line at the end of its note, carrying only the title; its original position and list marker are not restored
- A Todoist label containing a space, or any other character a `#tag` cannot hold, is left untouched in Todoist rather than synced into the note
- A task moved to a different Todoist project stops being synced by this plugin until it is moved back; it is not deleted, but its line and the task no longer affect each other in the meantime
- Moving a task in Todoist under a parent whose line lives in a different note is not reflected in Obsidian yet; the move is retried on every sync rather than acted on with stale information
- Tasks created directly in Todoist are not pulled into a note, unless they are a sub-task nested under a task this plugin already syncs. Otherwise, only tasks this plugin created are followed, which is what "partial two-way sync" means
- Conflicts are resolved by comparing the device's clock with Todoist's, so a device whose clock is badly off can pick the wrong winner
- Todoist offers no trash for tasks, so a task this plugin removes is deleted permanently
- The notes and `data.json` are separate files. If they get out of step, through a partial restore or a third-party vault sync running slightly behind, task identity and the 60-second grace period usually re-link the line to its existing task rather than duplicating it — but a link that never catches up still ends up creating a second task eventually

## Installation

1. Clone this repository
2. Run `npm install`
3. Build with `npm run build`
4. Copy `dist/main.js`, `manifest.json` and `styles.css` into `<your vault>/.obsidian/plugins/obsidian-task-sync/`
5. Enable **Obsidian Task Sync** under **Settings → Community plugins**

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Obsidian 1.11.4+ (for testing)

### Scripts

- `npm run dev` — Watch mode for development; every build is also copied into `obsidian-test-vault`
- `npm run build` — Production build
- `npm test` — Run every test, offline and integration. Requires `OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN`
- `npm run test:unit` — Run the offline suite on its own, no token needed
- `npm run test:watch` — Run the offline suite in watch mode
- `npm run test:integration` — Run only the tests that call the real Todoist API

### Project Structure

```
src/
  main.ts           # Plugin lifecycle & wiring
  settings.ts       # Settings interface, defaults, and setting tab
  stored-data.ts    # Reads and validates what was written to data.json
  services/
    task-provider.ts        # Provider-neutral interface the plugin talks to
    provider-credentials.ts # How a provider authenticates, which it renders itself
    task-provider-error.ts  # Typed connection failures
    provider-connection.ts  # Current connection status and how to re-establish it
    status-reporter.ts      # Turns sync results and failures into logs and notices
    http/
      http-client.ts          # Transport port
      obsidian-http-client.ts # Adapter over Obsidian's requestUrl
    todoist/
      todoist-api-client.ts   # Todoist REST calls
      todoist-credentials.ts  # The API token row and the token behind it
      todoist-payloads.ts     # Maps Todoist JSON onto the plugin's own types
      todoist-provider.ts     # Todoist implementation of the provider interface
    sync/
      task-collection.ts      # The task-source module: composes the finder and the change listener
      task-finder.ts          # Which files and task lines are in scope
      task-change-listener.ts # Which vault events matter to the configured scope
      task-line.ts            # Parses and formats a markdown checkbox line
      block-id.ts             # Mints the block ids that anchor tasks
      device-tag.ts           # The per-device tag baked into freshly minted block ids
      task-links.ts           # Block id to provider task id mapping, with its stored form
      task-index.ts           # Looks up a project's tasks by id or by embedded block id
      task-description.ts     # Reads/renders a task's description block; the provider description shape
      tag-set.ts              # Canonical, order-independent comparison of a task's tags
      orphan-tracker.ts       # Tracks how long a task has been orphaned, and its removal date
      orphan-notice.ts        # The courtesy description notice for a flagged orphan
      orphan-housekeeping.ts  # Flags, un-flags and removes orphaned tasks each run
      task-sync.ts            # Orchestrates one run over every file in scope and the project's tasks
      linked-line-sync.ts     # Syncs every field of one already-linked line
      missing-line-sync.ts    # Resolves links whose line has vanished from every scanned file
      remote-child-sync.ts    # Pulls a provider-only sub-task of a linked task in as a new line
      parent-sync.ts          # Syncs which task a line is nested under, including relocation
      task-tree.ts            # Indentation-derived parentage, subtree spans, and reindenting
      reparent-children.ts    # Promotes a removed task's children to top-level first
      field-sync.ts           # The one conflict rule every synced field shares
      grace-period.ts         # The debounce shared by creation and deletion
      project-resolver.ts     # Falls back to the provider's default project
      note-edits.ts           # Applies a pass's line edits to the note content
      sync-pass.ts            # One file's working state, from note lines to outcome
      sync-outcome.ts         # What a run reports back once it's done
      source-note.ts          # The port a sync pass reads and writes a note through
      sync-scheduler.ts       # The poll and the debounce that start a sync
      obsidian-source-note.ts # Adapter over the vault for one note in scope
  views/
    source-location-suggest.ts # Picker for the source note or folder
    tag-suggest.ts             # Picker for the source tag, offering tags already in the vault
    project-suggest.ts         # Picker for the Todoist project
    suggestions.ts             # Matching and capping shared by the pickers
    rendered-anchor.ts         # Hides sync anchors in reading view
    settings-text.ts           # Wording for the settings tab
  utils/
    logger.ts                 # Logging utility
    external-text.ts          # Makes text from outside the plugin safe to display or store
    ignore-pattern.ts         # The wildcard matcher behind ignore file patterns
    query-filter.ts           # Case-insensitive filtering shared by the pickers
    random-token.ts           # Random lowercase tokens for block ids and device tags
    sync-interval.ts          # Bounds and parsing for the poll interval
    connection-status-text.ts # Describes a connection status in words
    type-guards.ts            # Narrowing helpers for untrusted values
  __tests__/        # Jest tests
  __mocks__/        # Mock definitions for testing
  __integration__/  # Tests that call the real Todoist API

styles.css          # Namespaced plugin styles
dist/               # Built plugin (generated)
manifest.json       # Obsidian plugin metadata
```

## Architecture

The plugin uses a provider abstraction pattern to support multiple task managers.

- **Task manager provider interface** — `TaskProvider` is the only thing the plugin talks to; everything Todoist-specific is confined to `src/services/todoist/`
- **Providers authenticate themselves** — how a provider is authenticated varies too much to model centrally, so the provider draws its own credential rows and owns the values behind them; the settings tab only asks whether it is ready to connect
- **Transport port** — provider clients speak to an `HttpClient` rather than to a concrete transport, so the plugin can use Obsidian's `requestUrl` (CORS-free, works on desktop and mobile) while the integration tests drive the identical code over `fetch`
- **Clear error handling and user feedback** — failures are typed (`not-configured`, `project-missing`, `invalid-credentials`, `rate-limited`, `unreachable`, `unexpected`) and surfaced in the settings tab
- **Task source** — one module decides which tasks are in scope and which vault changes matter, derived fresh from the settings every time rather than stored
- **Task identity** — each synced line carries an Obsidian block id such as `^ots-a1b2c3`, and `data.json` maps that id to the provider's task id plus what both sides last agreed on for each field. The provider's id never enters the note, so switching providers rewrites one file rather than every note
- **Duplicate avoidance** — the same block id is also embedded in the provider task's description, so a line `data.json` has lost track of can be found and re-linked instead of duplicated, and a per-device tag keeps two devices from ever minting the same id in the first place
- **Orphan lifecycle** — a task that loses its link, or whose line moves out of scope, is flagged, then removed, on a schedule tracked entirely in the plugin's own data; the description notice it gets is a courtesy only
- **Deletion sync** — a linked line missing from every scanned note, or a linked task missing from the project's fetched list, is resolved past a grace period via `TaskProvider.getTask`, which tells a genuine deletion apart from the task simply having moved to a different project
- **Nested tasks** — a line's parent is derived from indentation every pass rather than stored as a setting, so it stays correct through renames and reordering; relocating a task moves its whole subtree, description and nested children included

Future versions will add:

- Mapping the Tasks plugin's custom checkbox states onto Todoist (feature 10)
- Due dates, recurrence and more fields sourced from the Tasks plugin (feature 11)

## License

AGPL-3.0-or-later — Free for non-commercial use. Commercial licensing available upon request.

## Testing

All changes must pass the test suite:

```bash
npm test
```

Tests cover:

- Plugin structure, lifecycle hooks, and graceful failure
- Settings load/save, including tolerance of a corrupt `data.json`
- The settings tab: source scope, tag and ignore patterns, credentials, connection status, project picker, sync interval and debug mode
- Following a renamed or moved source location, and clearing a deleted one
- The Todoist client's request shape, pagination, and its mapping of API failures
- Task line parsing, description blocks, tags, indentation-derived nesting, and block id minting (including the per-device tag)
- The sync run in both directions for every field, across one or many files, with conflict resolution by recency
- Re-linking and the creation grace period, deletion sync, and the orphaned-task lifecycle — including what is kept when a call fails midway

### Integration tests

The integration suite calls the real Todoist API to catch changes on Todoist's side. It runs as
part of `npm test`, and therefore as part of the pre-commit hook.

`npm test` runs both suites in one Jest command, through its `--projects` option, so a single
summary covers the lot.

The token is read from the `OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN` environment variable. Get one
in Todoist under **Settings → Integrations → Developer**. Without it one test fails on purpose
with a message explaining what to do, and the rest of the integration suite is skipped. The
offline suite still runs and reports normally. It is never skipped silently, because a guard that
quietly does nothing is no guard at all. For the offline suite on its own, run `npm run test:unit`,
which needs no token.

There are three ways to supply it. None of them put the token in the repository, and none of them
should: the token grants full access to your Todoist account.

#### One run at a time

Prefix the command. The token lives only for that process and is never written anywhere.

```bash
OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN=your-token npm test
```

Best for an occasional check. The drawback is your shell history: in zsh, start the line with a
space to keep it out of the history file, provided `HIST_IGNORE_SPACE` is set.

#### One terminal session

Export it once, then run the tests as often as you like in that terminal.

```bash
export OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN=your-token
npm test
```

This also covers `git commit` from that same terminal, because the pre-commit hook inherits the
environment of whatever process starts the commit. It is gone when you close the terminal.

#### Every session

Add the export line to `~/.zshrc` (or `~/.bashrc`). This is the most convenient option and the
only one that reliably works when committing from an editor's source-control UI rather than a
terminal, since the editor inherits the token at launch.

```bash
echo 'export OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN=your-token' >> ~/.zshrc
```

The cost is that the token sits in a plaintext file in your home directory and is exported into
every process you start. Restrict the file with `chmod 600 ~/.zshrc`, and remember that an editor
already running will not see the change until it is restarted.

#### What the suite does to your account

It creates its own temporary project, does the whole task round trip inside it, and deletes that
project when it finishes. Your existing projects and tasks are never read or modified, and nothing
is left behind. If a run is killed part way through, a project named `obsidian-task-sync test <timestamp>`
may survive and can be deleted by hand.
