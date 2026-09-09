# Add More Fields

## Scenarios

### Scenario: Add Priority
- **GIVEN** a task in Obsidian has a priority
- **WHEN** these changes are synced
- **THEN** the task in the task provider also gets the priority from Obsidian

- **GIVEN** a task in the task provider has a priority
- **WHEN** these changes are synced
- **THEN** the task in Obsidian also gets the priority from Obsidian

### Scenario: Sync Conflicts
- **GIVEN** changes are synced between the task provider and Obsidian
- **WHEN** a sync conflit arises
- **THEN** the conflict is handled by the conlfict resolution establisehed in feature 5

## Architecture

1. The plugin shall work both in Obsidian desktop and mobile.
2. Besure to encapsulate any Todoist-specific code in it's own module.
3. The module shall have a generic interface to the rest of the plugin so that the connected task amangement provider may be changed without too much changes to this interface.
4. Write a basic integration tests against the Todoist API that ensures that the functionlity used by the plugin is still working as expected.
