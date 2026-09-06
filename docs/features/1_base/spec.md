# Get a "hello world" plugin version in place

## Scenarios

### Scenario: Plugin loads successfully
- **WHEN** Obsidian is loaded
- **THEN** the plugin is loaded without errors

#### Subscenario: Error Handling
- **WHEN** the plugin does not load successfully
- **THEN** the user is informed with an easy to understand message and the details of the problems are logged to an appropriate logfile
