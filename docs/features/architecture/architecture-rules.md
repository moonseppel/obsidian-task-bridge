# General

1. The plugin shall work both in Obsidian desktop and mobile.
2. Besure to encapsulate any Todoist-specific code in it's own module.
3. The module shall have a generic interface to the rest of the plugin so that the connected task amangement provider may be changed without too much changes to this interface.
4. Write a basic integration tests against the Todoist API that ensures that the functionlity used by the plugin is still working as expected.
5. The integration tests against the Todoist API run as part of the normal test command and fail when no API token is present.
6. Debug mode is one general switch in the settings, off by default, and never a setting per feature.
