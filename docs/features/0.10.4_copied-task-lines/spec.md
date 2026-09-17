# Copied Task Lines

A task line copied to a second place is a second task. The line the block id has always belonged to keeps its task; every other line carrying that same id is given an id, and a task, of its own.

## Scenarios

### Scenario: A copied task line becomes its own task
- **GIVEN** two task lines in scope carry the same block id, in two notes or twice in one note
- **AND** one provider task carries that block id
- **WHEN** the vault has looked that way for the length of the grace period a newly written line already waits out
- **THEN** one of the lines keeps the block id and stays linked to that task
- **AND** every other line carrying it is given a freshly minted block id in its place
- **AND** each of those lines then gets a task of its own, exactly as a task line written from scratch does
- **AND** nothing else about those lines changes: their text, their indentation, their description and everything nested under them are untouched

### Scenario: A shared block id is synced against one line only
- **GIVEN** a block id anchors more than one task line in scope
- **WHEN** a sync runs, whether or not the grace period has passed
- **THEN** only the line keeping the id is synced
- **AND** no field of its task is compared against, pushed from or pulled into any other line carrying that id
- **AND** which file the link records as the id's last known one does not change on account of those other lines
