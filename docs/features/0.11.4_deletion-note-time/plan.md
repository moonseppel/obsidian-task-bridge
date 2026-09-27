# Implementation Plan: Feature 0.11.4 (Include Deletion Time in Orphan Notice)

## Context
The goal is to update the orphan notice to include the precise time (hours and minutes) when an orphaned task will be permanently removed, rather than just the date. 

## Slices

### Slice 1: Include time in the orphan notice text
- **Goal:** Update the `removalDate` format so the notice includes hours and minutes.
- **Changes:**
  - In `src/services/sync/orphans/orphan-notice.ts`, modify `orphanNoticeDescription`.
  - Format `removalDueAt` using `.slice(0, 16).replace('T', ' ')` instead of `.slice(0, 10)` to yield `YYYY-MM-DD HH:MM`.
  - In `src/__tests__/services/sync/orphans/orphan-notice.test.ts`, update the existing test `"names when the task was created and that it is now orphaned"` to assert `expect(description).toContain('2026-01-15 00:00');`.
- **Verification:** Run `npm test` to ensure `orphan-notice.test.ts` passes and no other tests break.

## Compliance with Rules
- **Work in small slices:** The work is contained in a single slice that builds, passes tests, and can be committed independently.
- Does not change the actual deletion timing or rules, only the text of the remote task description.
- Preserves the `NOTICE_MARKER` so the stripping logic in `stripOrphanNotice` remains intact.
