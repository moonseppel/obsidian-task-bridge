# Add Conflict Resolution

## Scenarios

### Scenario: Sync from Obsidian
- **GIVEN** there are changes in Obsidian and Todoist
- **AND** these changes affect the same field
- **AND** these changes are conflicting
- **WHEN** these changes are synced
- **THEN** the conflict is solved in a way that keeps the need for the user to solve it at a very low propability

## Architecture

1. The plugin shall work both in Obsidian desktop and mobile.
2. Besure to encapsulate any Todoist-specific code in it's own module.
3. The module shall have a generic interface to the rest of the plugin so that the connected task amangement provider may be changed without too much changes to this interface.
4. Write a basic integration tests against the Todoist API that ensures that the functionlity used by the plugin is still working as expected.
