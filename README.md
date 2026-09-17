# TaskBridge

## BETA NOT YET STARTED. Still under test, but will get it's first beta release soon.

An Obsidian plugin that synchronizes task checkboxes between Obsidian notes and Todoist. If you
are using tasks in Obsidian and want also to have the full feature set of a task manager or just
create a few tasks in Obsidian and mainly are suing a task manager, this plugin might be the right
choice for you.

This plugin currently is in public beta. I thoroughly tested it, but since that was just in
configurations, data loss might happen. So please use with care for now and please
[report any bugs you may find](https://github.com/moonseppel/obsidian-task-bridge/issues).
Thank you :) Installation should happen via BRAT, see
[Installation using BRAT](#installation-using-brat).

Created and maintaned by Jan Pralle, [www.jpcloudsolutions.de](www.jpcloudsolutions.de).

## Features

- **Partial two-way sync**: All Obsidian tasks are pushed to the task manager; tasks that originated in Obsidian sync back two-way, also syncs deletions
- **Open-source**: Licensed under MPL-2.0
- **Mobile access**: Works both in Obsidian desktop and mobile

### Details

- Full vault sync, folder sync or single not sync.
- Filter synced tasks by tag.
- Ignore pattern for files (e.g. for conflict files from third party sync tool for vaults).
- Syncs title, description, nested tasks and state.
- Copy a task line and the copy becomes a task of its own.
- Support of Obsidian's "Tasks" plugin to come.

See `docs/features/` directory in the source code for more details on the features. There may be
features already documented, that are not implemented yet. The minor version number reflects the
latest implemented feature.

## Connecting to Todoist

Requires Obsidian 1.11.4 or newer.

1. In Todoist, go to **Settings → Integrations → Developer** and copy your API token.
2. In Obsidian, open **Settings → TaskBridge**.
3. Next to **API token**, add the token as a secret and select it.

The token is held in Obsidian's secret storage, never in the plugin's `data.json`. That storage is
local to the vault on each device, so the token has to be entered **once per device** — the upside is
that it is not carried along by vault sync, backups, or a git repository.

## How syncing works

Choose which tasks to sync and a Todoist project in the settings, and every checkbox line in scope
is kept in step with a task in that project.

```markdown
- [ ] Buy milk #errands ^tb-a1b2c3
	Oat milk, not regular
- [x] Call the dentist ^tb-d4e5f6
```

The `^tb-...` suffix is an ordinary Obsidian block identifier. The plugin appends it the first time
it syncs a line, and it is what ties that line to its Todoist task, so the title can change on
either side without the link breaking. `[[Tasks#^tb-a1b2c3]]` links to that task from anywhere in
the vault, and uninstalling the plugin leaves valid Obsidian markup behind.

Checking the box completes the Todoist task, and completing it in Todoist checks the box. The lines
indented at least one level deeper than a task line are its Todoist description — bullets, their
continuation lines, paragraphs, and lines holding nothing but whitespace, which count as blank lines inside
it — until the first line indented no deeper than the task itself, an empty line included. It reaches
Todoist with one indent level removed, so any deeper indentation inside it is kept. An indent level is
a tab or a full run of as many spaces as your editor's tab size, so the soft-break continuation Obsidian
writes with spaces stays part of the description it belongs to. A
`#tag`, wherever it stands in the task's own text, is a Todoist label. A task indented one level under another is its
Todoist sub-task. All five fields — title, state, description, tags, parent — sync both ways and
independently of each other. See [Nested tasks](#nested-tasks) for how nesting itself works.

The anchor is hidden in reading view unless **Debug mode** is on; Live Preview always shows it. See
[Debug mode](#debug-mode) for why.

A sync runs when the plugin loads, ten seconds after you stop editing a note in scope, on the poll
interval, and whenever you run **Sync now** from the command palette. Editing a note while a sync is
already running schedules another pass, so a change made in that window is not left waiting for the
next poll.

### Which tasks are synced

- **Note or folder** — a note syncs just that note; a folder syncs every note under it, however deeply nested
- **Sync the whole vault** — syncs every note in the vault; the note or folder field stays visible but disabled while this is on
- **Tag** — only task lines carrying this `#tag`, anywhere in their own text, are synced, on top of whichever of the above applies; leave it empty to sync every task in scope
- **Ignore file patterns** — comma-separated file names skipped when scanning a folder or the whole vault, such as the conflict copies a third-party sync tool creates; `*` matches any run of characters, and matching ignores case

A note you selected explicitly is always synced, even if an ignore pattern matches it, and the
settings warn you when that happens. Scope is worked out fresh on every sync. The configured note or
folder is followed when it is renamed or moved, and cleared with a notice when it is deleted.

A task line that moves out of scope — into a note outside the configured folder, or into an ignored
file — is not treated as deleted. Its Todoist task is flagged and removed on the same schedule as an
[orphaned task](#orphaned-tasks), and picked up again if the line comes back into scope first.

A note that fails to sync — because Obsidian could not read it, or because Todoist rejected one of
its tasks — does not hold up the rest of the vault: every other note in scope is still synced,
that note's tasks stay exactly where they are rather than being treated as deleted or out of scope,
and it is tried again on the next sync.

### Which project tasks go to

Your Inbox, until you choose otherwise. The project setting starts on the
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

### Orphaned tasks

A task that carries this plugin's block id but has no live link back to it — because the line was
edited out from under it, or `data.json` (the plugins internal settings store) was reset — is orphaned.
After an hour, its description is updated with a notice that it will be removed in two days, and
that date is recorded in the plugin's own data, never read back from the notice text. If it is
re-linked before then, the notice is reverted and nothing more happens; otherwise it is removed
once the date passes. You can stop the deletion process if you delete the ID from the tasks
description.

### Task deletion

Deleting a task line in a note removes its linked Todoist task; deleting a task in Todoist removes
its linked line. Either way, the deletion is only acted on once it has held for 60 seconds across
passes. Moving a task to a different Todoist project is not treated as a deletion: the line and
the link are both left exactly as they are, and are picked up again if the task ever moves back. A
deletion that conflicts with a concurrent edit on the other side is resolved by the same recency
rule as a title conflict, except the newer edit resurrects what the older side deleted — recreating
the task from an edited line, or re-appending a line (at the end of the note it was last seen in)
from an edited task — instead of the edit being silently lost. Deleting a task that still has
synced sub-tasks does not take them down with it: they are promoted to top-level in Todoist first,
since Todoist itself would otherwise delete every descendant of a removed task along with it.

### Copied task lines

Copy a task line somewhere else and you get a second task: the line the block id has always
belonged to keeps its own task, and every other line carrying that id is given a fresh id and a
task of its own. Nothing else about those lines changes — their text, their indentation, their
description and everything nested under them stay exactly as they are.

Until that is settled, only the line keeping the id is synced: no field of its task is compared
against, pushed from or pulled into any other line carrying the same id. A copy is only acted on
once it has been there for 60 seconds across passes, the same wait a newly written task line
already gets, so a vault sync tool that writes a moved note before removing the old one does not
leave you with a spurious second task.

### Nested tasks

A task indented one level under another syncs as that task's sub-task in Todoist, and a sub-task in
Todoist syncs into the note as a line indented one tab under its parent — recursively, so a whole
tree of tasks nests the same way on both sides.

```markdown
- [ ] Plan the trip ^tb-a1b2c3
	- [ ] Book flights ^tb-d4e5f6
	- [ ] Book hotel ^tb-g7h8i9
```

Which task is a line's parent is read fresh from indentation every sync, never stored as a separate
setting, so moving a task to a different indentation level moves it to a different parent in
Todoist too, on whichever side the change was made. A task that loses its parent entirely — its
line is unindented, or its Todoist parent is cleared — becomes a standalone task on the other side
as well, while whatever is nested under it stays exactly where it is. A sub-task added directly in
Todoist, under a task already synced from Obsidian, is pulled into the note too; a task created
directly in Todoist with no synced task anywhere above it in its chain still isn't.

Nesting ends where a description does: at the first line indented no deeper than the parent, an
empty line included, while a line holding nothing but whitespace keeps it going. Within a task's
description, a checkbox line indented two or more levels under the task, or with spaces left over
past its last level, is part of the description rather than a sub-task — Obsidian doesn't display it
as a task either. A task already synced from a line that became description text this way is flagged and
removed in Todoist on the same schedule as a task moved out of scope, while its text lives on in the
parent's description.

## Debug mode

One switch in the settings, off by default, for when something needs diagnosing. It does two things:
it reveals this plugin's `^tb-` anchors in reading view, and it prints this plugin's debug logging
to the developer console.

The debug log records every decision a sync makes — which field was pushed or pulled and why, every
task created, re-linked, removed or resurrected, every step of the orphan lifecycle — and every
request to Todoist with its status and duration. Tasks are named by block id and Todoist task id
only: titles, descriptions, tags, note text and your API token never appear in it, so it is safe to
attach to a bug report. Without debug mode the console still shows the plugin loading, connection
and project changes, every task and task line created or deleted, failures, and a summary of every
sync that changed something.

Reading view offers no CSS hook for a block identifier, so while debug mode is off the plugin edits
the rendered text instead, matching on the `tb-` prefix, and on the `ots-` prefix minted before it.
Only its own anchors are touched, and only the rendered copy: the note on disk keeps its anchor.
This applies as views are drawn, so a reading view that is already open may need reopening after you
flip the switch. Obsidian itself swallows a block identifier that terminates a block, which is what
the last item of a list does; those never reach the page, so no setting can reveal them there.

Live Preview shows the anchors on every task line regardless of this setting. Hiding them only on
the lines the cursor is not on made the end of a line jump around as the cursor moved onto and off
of it.

## Known limitations

- Any checkbox character other than a space counts as done, so a custom state such as `[/]` or `[-]` syncs as a completed task
- A line resurrected from a Todoist edit is appended as a plain `- [ ]` line at the end of its note, carrying only the title; its original position and list marker are not restored
- A Todoist label containing a space, any other character a `#tag` cannot hold, or nothing but digits is left untouched in Todoist rather than synced into the note
- Tasks created directly in Todoist are not pulled into a note, unless they are a sub-task nested under a task this plugin already syncs. Otherwise, only tasks this plugin created are followed, which is what "partial two-way sync" means
- Conflicts are resolved by comparing the device's clock with Todoist's, so a device whose clock is badly off can pick the wrong winner
- Todoist offers no trash for tasks, so a task this plugin removes is deleted permanently
- The notes and `data.json` are separate files. If they get out of step, through a partial restore or a third-party vault sync running slightly behind, task identity and the 60-second grace period usually re-link the line to its existing task rather than duplicating it — but a link that never catches up still ends up creating a second task eventually
- An indent level is a tab or a complete run of the editor's tab size in spaces; spaces left over past the last complete run are part of the line's text, so a line indented with fewer spaces than the tab size neither forms a description nor nests under a task
- The editor's tab size is read once per sync run, so changing it takes effect on the next sync rather than immediately
- A tag's place inside a task's text is not preserved when the title is changed in Todoist and pulled: the tag moves to the end of the line, since the text it stood in no longer exists

## Installation using BRAT

1. Install the BRAT community plugin from Settings → Community plugins and enable it.
2. Open BRAT's settings, or run BRAT: Add a beta plugin for testing from the command palette.
3. Enter `moonseppel/obsidian-task-bridge` as the repository and confirm.
4. Enable TaskBridge under Settings → Community plugins.

BRAT installs the latest release and checks for updates automatically, so this is the recommended
way to install while the plugin is in public beta.

## Manual Local Installation

1. Clone this repository
2. Run `npm install`
3. Build with `npm run build`
4. Copy `dist/main.js`, `manifest.json` and `styles.css` into `<your vault>/.obsidian/plugins/task-bridge/`
5. Enable **TaskBridge** under **Settings → Community plugins**

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

## Architecture

The plugin uses a provider abstraction pattern to support multiple task managers.

- **Task manager provider interface** — `TaskProvider` is the only thing the plugin talks to; everything Todoist-specific is confined to `src/services/todoist/`
- **Providers authenticate themselves** — how a provider is authenticated varies too much to model centrally, so the provider draws its own credential rows and owns the values behind them; the settings tab only asks whether it is ready to connect
- **Transport port** — provider clients speak to an `HttpClient` rather than to a concrete transport, so the plugin can use Obsidian's `requestUrl` (CORS-free, works on desktop and mobile) while the integration tests drive the identical code over `fetch`
- **Clear error handling and user feedback** — failures are typed (`not-configured`, `project-missing`, `invalid-credentials`, `rate-limited`, `unreachable`, `unexpected`) and surfaced in the settings tab
- **Task source** — one module decides which tasks are in scope and which vault changes matter, derived fresh from the settings every time rather than stored
- **Task identity** — each synced line carries an Obsidian block id such as `^tb-a1b2c3`, and `data.json` maps that id to the provider's task id plus what both sides last agreed on for each field. The provider's id never enters the note, so switching providers rewrites one file rather than every note
- **Duplicate avoidance** — the same block id is also embedded in the provider task's description, so a line `data.json` has lost track of can be found and re-linked instead of duplicated, and a per-device tag keeps two devices from ever minting the same id in the first place
- **Orphan lifecycle** — a task that loses its link, or whose line moves out of scope, is flagged, then removed, on a schedule tracked entirely in the plugin's own data; the description notice it gets is a courtesy only
- **Deletion sync** — a linked line missing from every scanned note, or a linked task missing from the project's fetched list, is resolved past a grace period via `TaskProvider.getTask`, which tells a genuine deletion apart from the task simply having moved to a different project
- **Nested tasks** — a line's parent is derived from indentation every pass rather than stored as a setting, so it stays correct through renames and reordering; relocating a task moves its whole subtree, description and nested children included
- **Copied lines** — which line a block id belongs to is decided across a whole run rather than within one note, since files are synced one at a time; only that line is synced, and every copy is given an id of its own once the duplicate has held long enough to be real

## License

MPL-2.0 — free for any use, including commercial. If you modify a file this project ships, you
must share your changes to that file back under MPL-2.0; you may still combine it with proprietary
code in a larger work.

## Testing

All changes must pass the test suite:

```bash
npm test
```

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
is left behind. If a run is killed part way through, a project named `task-bridge test <timestamp>`
may survive and can be deleted by hand.

## Use of AI

Most of this repository is AI coded. I started this project to improve my skills using AI coding
and out of need for a actually working task sync tool for Obsidian. I tried to ge the AI to develop
the project according to Software Craftmanship standards. It is not vibe-coded in a sense that you
just prompt the AI what to do and then what to change and so on. Every step is started by a feature
description in 'docs/features/' and governed by a set of coding guidelines, which I did not include
in the repository, but that include Clean Code rules and more.

Since my TypeScript skills are limited, I did not review the code extensively and after some tries
to permanently get the AI to improve naming and strcture, I gave up on this. So the code and the
use of comments is somehwat mediocre, as most projects are (guess where the AI learned, huh?).
