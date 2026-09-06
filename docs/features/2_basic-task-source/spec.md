# Enables setting a single note as source for tasks to sync

## Scenarios

### Scenario: Select source note
- **WHEN** the user opens the settings of the plugin
- **THEN** the user has the option to select a single note as the source for tasks to sync
- **AND** the selection is offered as a fuzzy search over the markdown notes in the vault

### Scenario: Change source note
- **GIVEN** a source note is already configured
- **WHEN** the user picks a different note in the settings
- **THEN** the new note replaces the previous one and the change is persisted

### Scenario: Clear the source note
- **WHEN** the user clears the source note field in the settings
- **THEN** no source note is configured
- **AND** the empty selection is persisted

### Scenario: Configured source note is renamed or moved
- **GIVEN** a source note is configured
- **WHEN** that note is renamed or moved within the vault
- **THEN** the stored setting follows the note to its new path without the user re-selecting it

### Scenario: Configured source note is deleted
- **GIVEN** a source note is configured
- **WHEN** that note is deleted from the vault
- **THEN** the source note setting is cleared
- **AND** the user is informed with an easy to understand message

### Scenario: Configured source note no longer exists
- **GIVEN** the stored source note path does not resolve to an existing note
- **WHEN** the user opens the settings of the plugin
- **THEN** the field still shows the stored path
- **AND** a visible warning informs the user that the note was not found
