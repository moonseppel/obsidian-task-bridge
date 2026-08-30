# Get a "hello world" plugin version in place

## Scenarios

### Scenario: Plugin loads succesfully
- **WHEN** Obsidian is loaded
- **THEN** the plugin is loaded without errors

#### Subscenario: Error Handling
- **WHEN** the plguin does not loads successfully
- **THEN** the user is informed with a easy to understand message and the details of the problems are logged to an appropriate logfile
