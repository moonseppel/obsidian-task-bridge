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
