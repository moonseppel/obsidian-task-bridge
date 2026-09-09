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

Next: Feature 4 — sync task titles.

## Connecting to Todoist

Requires Obsidian 1.11.4 or newer, which is where Obsidian's secret storage arrives.

1. In Todoist, go to **Settings → Integrations → Developer** and copy your API token.
2. In Obsidian, open **Settings → Obsidian Task Sync**.
3. Next to **API token**, add the token as a secret and select it.

The token is held in Obsidian's secret storage, never in the plugin's `data.json`. That storage is
local to the vault on each device, so the token has to be entered once per device — the upside is
that it is not carried along by vault sync, backups, or a git repository.

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
  services/
    task-provider.ts        # Provider-neutral interface the plugin talks to
    task-provider-error.ts  # Typed connection failures
    provider-connection.ts  # Current connection status and how to re-establish it
    http/
      http-client.ts          # Transport port
      obsidian-http-client.ts # Adapter over Obsidian's requestUrl
    todoist/
      todoist-api-client.ts   # Todoist REST calls
      todoist-provider.ts     # Todoist implementation of the provider interface
  views/
    source-note-suggest.ts  # Fuzzy note picker for the source-note setting
  utils/
    logger.ts       # Logging utility
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
- **Transport port** — provider clients speak to an `HttpClient` rather than to a concrete transport, so the plugin can use Obsidian's `requestUrl` (CORS-free, works on desktop and mobile) while the integration tests drive the identical code over `fetch`
- **Clear error handling and user feedback** — failures are typed (`not-configured`, `invalid-credentials`, `rate-limited`, `unreachable`, `unexpected`) and surfaced in the settings tab

Future versions will add:

- Local metadata for task identity mapping
- Sync state tracking to prevent duplicates

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

### Integration tests

The integration suite calls the real Todoist API to catch changes on Todoist's side. It runs as
part of `npm test`, and therefore as part of the pre-commit hook.

The token is read from the `OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN` environment variable. Get one
in Todoist under **Settings → Integrations → Developer**. Without it the run fails immediately
with a message naming the variable — it is never skipped silently, because a guard that quietly
does nothing is no guard at all. For the offline suite on its own, run `npm run test:unit`, which
needs no token.

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

It only reads (`GET /api/v1/user`) and never creates or changes anything.
