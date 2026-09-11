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

**Feature 3: Complete** — Establish the Todoist connection: pick a Todoist API token in the settings, the connection is established when Obsidian starts, and a "Test connection" button reports the current state. Todoist-specific code lives behind a provider-neutral interface, and an opt-in integration suite checks the live Todoist API.

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

Next: Feature 6 — task deletion sync.

## Connecting to Todoist

Requires Obsidian 1.11.4 or newer, which is where Obsidian's secret storage arrives.

1. In Todoist, go to **Settings → Integrations → Developer** and copy your API token.
2. In Obsidian, open **Settings → Obsidian Task Sync**.
3. Next to **API token**, add the token as a secret and select it.

The token is held in Obsidian's secret storage, never in the plugin's `data.json`. That storage is
local to the vault on each device, so the token has to be entered once per device — the upside is
that it is not carried along by vault sync, backups, or a git repository.

## How syncing works

Pick a source note and a Todoist project in the settings, and every checkbox line in that note is
kept in step with a task in that project.

```markdown
- [ ] Buy milk ^ots-a1b2c3
- [x] Call the dentist ^ots-d4e5f6
```

The `^ots-...` suffix is an ordinary Obsidian block identifier. The plugin appends it the first time
it syncs a line, and it is what ties that line to its Todoist task, so the title can change on
either side without the link breaking. `[[Tasks#^ots-a1b2c3]]` links to that task from anywhere in
the vault, and uninstalling the plugin leaves valid Obsidian markup behind.

The anchor is hidden by default, in reading view and while editing alike, and **Debug mode** in the
settings brings it back. See [Debug mode](#debug-mode) for what that costs.

A sync runs when the plugin loads, two seconds after you stop typing in the source note, on the
poll interval, and whenever you run **Sync now** from the command palette. Editing the note while
a sync is already running schedules another pass, so a change made in that window is not left
waiting for the next poll.

### Which project tasks go to

Your Inbox, until you choose otherwise. The project list is remembered in `data.json`, so the
picker still offers your projects when you are offline. It is refreshed only when you open the
settings, change the API token, or press **Test connection**. The project setting starts on the Inbox as soon as the
connection is established, and picking a suggestion is the only way to change it, so it can never be
left empty. A sync therefore never stalls for want of a project.

If the project you chose is later deleted in Todoist, syncing falls back to the Inbox, remembers
that, and tells you once so the change is never silent.

### What wins when both sides changed

A change on only one side always wins outright: it is pushed or pulled, no contest. When both
sides changed to different titles since they last agreed, it is a genuine conflict, and the newer
edit wins — the source note's modification time against the Todoist task's. When recency can't be
told, because the remote timestamp is missing or the two are exactly equal, the Obsidian edit wins,
deterministically, so the outcome never flips back and forth from one sync to the next. When both
sides happened to change to the *same* title, there is nothing to reconcile and neither side is
touched.

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

## Debug mode

One switch in the settings, off by default, for when something needs diagnosing. It does two things:
it reveals the `^ots-` anchors, and it prints this plugin's debug logging to the developer console.

With debug mode off, the anchors are hidden in two different ways, because Obsidian renders the two
views differently.

- **Reading view** offers no CSS hook for a block identifier, so the plugin edits the rendered text
  instead, matching on the `ots-` prefix. Only its own anchors are touched, and only the rendered
  copy: the note on disk keeps its anchor. This applies as views are drawn, so a reading view that is
  already open may need reopening after you flip the switch
- **Live Preview** does expose a class, so a rule in `styles.css` hides it. The class carries no hint
  of which plugin wrote the identifier, so while debug mode is off this hides **every** block
  identifier in your vault, not only this plugin's. The line your cursor is on is left alone, because
  hiding the text under the caret makes arrow keys skip across it

Turning debug mode on reverses both. One caveat in reading view: Obsidian itself swallows a block
identifier that terminates a block, which is what the last item of a list does. Those never reach the
page, so no setting can reveal them. Live Preview shows all of them.

### Known limitations

- Only the title syncs. A `- [x]` line is created in Todoist as an open task, because completion
  state is not synced yet
- Deleting a task is not synced in either direction. A line removed from the note leaves its Todoist
  task alone, and a task deleted in Todoist leaves its note line alone
- Tasks created directly in Todoist are not pulled into the note. Only tasks this plugin created are
  followed, which is what "partial two-way sync" means
- The note and `data.json` are separate files. If they get out of step, through a partial restore or
  a third-party vault sync running slightly behind, task identity and the 60-second grace period
  usually re-link the line to its existing task rather than duplicating it — but a link that never
  catches up still ends up creating a second task eventually

## Installation

1. Clone this repository
2. Run `npm install`
3. Build with `npm run build`
4. Copy `dist/main.js` and `manifest.json` to your Obsidian test vault

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Obsidian 1.11.4+ (for testing)

### Scripts

- `npm run dev` — Watch mode for development
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
      task-line.ts            # Parses and formats a markdown checkbox line
      block-id.ts             # Mints the block ids that anchor tasks
      device-tag.ts           # The per-device tag baked into freshly minted block ids
      task-links.ts           # Block id to provider task id mapping, with its stored form
      orphan-tracker.ts       # Tracks how long a task has been orphaned, and its removal date
      orphan-notice.ts        # The courtesy description notice for a flagged orphan
      title-sync.ts           # The sync pass itself, plus how note edits are applied
      sync-scheduler.ts       # The poll and the debounce that start a sync
      obsidian-source-note.ts # Adapter over the vault for the configured note
  views/
    source-note-suggest.ts  # Fuzzy note picker for the source-note setting
    project-suggest.ts      # Picker for the Todoist project
    rendered-anchor.ts      # Hides sync anchors in reading view
    settings-text.ts        # Wording for the settings tab
  utils/
    logger.ts       # Logging utility
    sync-interval.ts  # Bounds and parsing for the poll interval
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
- **Task identity** — each synced line carries an Obsidian block id such as `^ots-a1b2c3`, and
  `data.json` maps that id to the provider's task id plus the title both sides last agreed on. The
  provider's id never enters the note, so switching providers rewrites one file rather than every note
- **Duplicate avoidance** — the same block id is also embedded in the provider task's description,
  so a line data.json has lost track of can be found and re-linked instead of duplicated, and a
  per-device tag keeps two devices from ever minting the same id in the first place
- **Orphan lifecycle** — a task that loses its link is flagged, then removed, on a schedule tracked
  entirely in the plugin's own data; the description notice it gets is a courtesy only

Future versions will add:

- Task deletion sync in both directions (feature 6)
- More synced fields, starting with priority (feature 7)

## License

AGPL-3.0-or-later — Free for non-commercial use. Commercial licensing available upon request.

## Testing

All changes must pass the test suite:

```bash
npm test
```

Tests cover:
- Plugin structure and lifecycle hooks
- Error handling and graceful failure
- Settings load/save and the source-note setting tab
- Source-note picker filtering, and rename/delete tracking of the configured note
- The Todoist client's request shape and its mapping of API failures
- Connection status handling and how it is reported in the settings tab
- Task line parsing, block id minting (including the per-device tag), and the link store's
  tolerance of corrupt data
- The sync pass in both directions, conflict resolution by recency, re-linking and the creation
  grace period, and the orphaned-task lifecycle — including what it keeps when a call fails midway

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
