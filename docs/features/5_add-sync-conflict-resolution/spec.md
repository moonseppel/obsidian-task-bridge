# Add Conflict Resolution

## Scenarios

### Scenario: Sync Conflict Resolution
- **GIVEN** there are changes in Obsidian and Todoist
- **AND** these changes affect the same field
- **AND** these changes are conflicting
- **WHEN** these changes are synced
- **THEN** the conflict is solved automatically
- **AND** the risk for the user to manually solve is kept at a minium

### Scenario: Multiple Device Sync
- **GIVEN** The user has multiple devices, desktop and mobile mixed
- **WHEN** a sync conlfict occurs
- **THEN** the conflict is solved automatically
- **AND** the risk for the user to manually solve is still kept at a minium

### Scenario: Vault Sync Between DEvices
- **GIVEN** The user has multiple devices, desktop and mobile mixed
- **AND** the vaults are synced on a file basis between them by a third party application
- **WHEN** a sync conlfict occurs
- **THEN** the conflict is solved automatically
- **AND** the risk for the user to manually solve is still kept at a minium

## Architecture
