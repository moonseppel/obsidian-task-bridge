# Establish Todoist Connection

## Scenarios

### Scenario: Connect to Todoist
- **GIVEN** There is a complete Todist confguration
- **WHEN** Obsidian is started
- **THEN** the connection to Todoist is established

### Scenario: Configure Todoist Connection
- **WHEN** the user open the settings of the plugin
- **THEN** he can spefiy the needed information to establish a Todist connection

## Architecture

1. The plugin shall work both in Obsidian desktop and mobile.
2. Besure to encapsulate any Todoist-specific code in it's own module.
3. The module shall have a generic interface to the rest of the plugin so that the connected task amangement provider may be changed without too much changes to this interface.
4. Write a basic integration tests against the Todoist API that ensures that the functionlity used by the plugin is still working as expected.
