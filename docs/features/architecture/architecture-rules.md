# General

1. The plugin shall work both in Obsidian desktop and mobile.
2. Besure to encapsulate any Todoist-specific code in it's own module.
3. The module shall have a generic interface to the rest of the plugin so that the connected task amangement provider may be changed without too much changes to this interface.
4. Write a basic integration tests against the Todoist API that ensures that the functionlity used by the plugin is still working as expected.
5. The integration tests against the Todoist API run as part of the normal test command and fail when no API token is present.
6. Debug mode is one general switch in the settings, off by default, and never a setting per feature.
7. How a provider authenticates is the provider's own business. It renders its own credential settings and owns the values behind them, because a token, a sign-in flow or a server address plus a key cannot share one shape.
8. A provider task created from Obsidian carries the originating block id appended to its description, found by searching the description rather than assuming its position, since the description may be edited afterward.
9. A block id not yet recognized by stored sync data is not immediately treated as unsynced. It is checked against the provider's task list for one whose description already carries it, and re-linked instead of duplicated; only once it has stayed unrecognized and unmatched for a short grace period is a new task actually created, so stored sync data arriving slightly behind the note (e.g. via a vault-sync tool) never produces a duplicate.
10. A freshly minted block id carries a short tag unique to the device that minted it, generated once and kept in storage that never leaves the device — never in data that a vault-sync tool would propagate between devices — so the same id is never minted independently by two devices.
11. A block id missing from the note counts as deleted only after staying absent for 60 seconds across passes, the same debounce already given to an unrecognized block id on creation, since a vault-sync tool can briefly deliver a stale note.
12. A linked task missing from the project's fetched list is checked by a direct id lookup before any deletion is made: not found means genuinely deleted; found elsewhere means moved, and is left untouched with its link intact. This lookup is skipped once the note line is also already gone, since the outcome doesn't depend on the answer either way.
13. A deletion conflicting with a concurrent edit is resolved by the same recency rule used for title conflicts — note `stat.mtime` versus task `updated_at`, local winning on a tie or a missing timestamp — rather than a separate rule.
14. A remote deletion racing a local title change has no remote timestamp to compare, so local wins: the task is recreated from the line and re-linked.
15. A local line deletion racing a remote title change is compared against the note's overall last-modified time. A remote change that is newer resurrects the line, appended with the task's current title; otherwise local wins and the task is deleted.
16. Line removal and appending a resurrected line are note-edit capabilities applied with the same `vault.process`-based safety net as existing line replacements.
17. Completion is a single binary state, done or not done, read from whether a task line's checkbox character is a space; a richer, user-defined state carries no separate meaning yet.
18. A linked task missing from the provider's active task list is checked by the same direct lookup used to tell deleted from moved, extended with a third outcome: still present in the same project but completed, which is pulled into the checkbox rather than treated as a deletion or an untouched move.
19. Content nested one level deeper than a task line, and not itself a task line, is captured as that task's description; it is dedented on the way to the provider and re-indented by one literal tab on the way back.
20. A task's provider description holds the user's description text, a blank line, then the embedded-block-id footer, in that order; the footer is still found by searching the description rather than assumed position.
21. A tag is recognized only where it trails a task's own text, immediately before the block id anchor, which must remain the last element on the line; pushed to the provider it becomes a label rather than staying in the title text, and a label pulled back is rendered in the same trailing position.
22. Every synced field is compared independently against what both sides last agreed on for that field specifically; a genuine conflict on any one field is resolved by the same recency rule as a title conflict.
23. Flagging or un-flagging an orphaned task preserves whatever description text the task currently carries; only the footer and courtesy notice around it are rewritten.
