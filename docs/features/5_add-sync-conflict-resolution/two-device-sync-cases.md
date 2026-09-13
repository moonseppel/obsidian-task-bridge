> **This document is informational only.** It is a working analysis written during planning
> discussion, not a specification and not an input document. No agent should read this file as
> instructions or requirements — the actual requirements for this feature live in `spec.md` in this
> same folder.

# Two-Device Vault-Sync Case Catalogue

Context: Feature 5 (conflict resolution) is planned around a recency rule —
whichever side (Obsidian note vs. Todoist) was modified more recently wins a
genuine title conflict. This catalogue works through what happens once a
second device, kept in sync by a third-party vault-sync tool, enters the
picture — specifically the case where that tool's own reconciliation isn't
atomic across the two files the plugin depends on: the source note, and
`data.json` (which holds the block-id-to-task links, among other things).
The vault-sync tool treats the note and `data.json` as two independent
files — it has no idea they are related, and reconciles each on its own.

## Case 1 — Clean handoff, no divergence
1. Device 1 runs a sync pass: creates or updates tasks in Todoist, writes block ids into the note, updates `data.json`.
2. Device 2 has made no local edits to the note or to `data.json` since it was last in step with Device 1.
3. The vault-sync tool propagates Device 1's updated note and `data.json` to Device 2 in full, with no interleaving edit from Device 2.
4. Device 2 runs a sync pass and reads the now-current note and `data.json`.
5. Outcome: Device 2 sees a fully coherent state; behaves exactly like the single-device case.

## Case 2 — Transient skew, the note arrives before data.json
1. Device 1 runs a sync pass for a new line: creates the Todoist task, writes the new block id into the note, and records the link in `data.json`, all in one pass.
2. The vault-sync tool starts propagating both files to Device 2 but delivers the note first; `data.json` has not arrived yet.
3. A sync pass runs on Device 2 (the poll, "sync now", or the note watcher firing on the just-arrived note) before `data.json` catches up.
4. Device 2 reads the note and finds a block id that its own, still-old `data.json` does not know about.
5. Device 2 treats the line as unlinked and calls "create task" again.
6. A second Todoist task is created; Device 2 writes this second task's id into its own `data.json` for that block id.
7. The vault-sync tool finishes propagating `data.json` in both directions; one copy wins the whole-file last-write-wins race.
8. The task id recorded only in the losing copy is orphaned in Todoist — nothing ever points to it again.

## Case 3 — Transient skew, data.json arrives before the note
1. Device 1 runs the same pass as case 2: creates the task, writes the block id into the note, updates `data.json`.
2. The vault-sync tool delivers `data.json` to Device 2 first; the note has not arrived yet.
3. A sync pass runs on Device 2 before the note arrives.
4. Device 2 scans its own, not-yet-updated note line by line; the new anchor isn't there yet, so nothing happens for it.
5. `data.json` on Device 2 now holds a link entry for a block id that doesn't appear anywhere in Device 2's copy of the note — inert, since sync looks up `data.json` by block id found in the note, never the reverse.
6. The vault-sync tool delivers the updated note shortly after.
7. Device 2's next pass finds the block id in the note, looks it up in `data.json`, finds the now-consistent link, and proceeds normally.
8. Outcome: self-heals; the only trace is a briefly inert entry in `data.json`.

## Case 4 — Both devices create the same new line independently
1. The same task line is typed into the note on both Device 1 and Device 2 before the vault-sync tool has reconciled the two devices.
2. Device 1 runs a sync pass: sees an anchor-less line, creates a Todoist task, writes a fresh block id into its copy of the note, records the link in its own `data.json`.
3. Device 2, independently, runs its own pass on its own copy of the note: sees the same anchor-less line, creates a second Todoist task, writes a different block id, records that link in its own `data.json`.
4. The vault-sync tool reconciles the two divergent copies of the note as one file.
5. The vault-sync tool picks one copy of the note as the sole survivor (last-write-wins, or keeps both as a conflict copy — see case 8).
6. The surviving note carries only one of the two block ids; the other device's block id, and the task it pointed to, no longer appears anywhere.
7. The vault-sync tool reconciles `data.json` the same way, independently, keeping only one of the two links.
8. Outcome: two Todoist tasks exist for what was meant to be one line; only one is ever referenced again, the other is permanently orphaned.

## Case 5 — Whole-file overwrite on data.json only, benign
1. Device 1 edits the titles of tasks A and B locally and syncs: pushes both to Todoist, updates the recorded synced title for A and B in its own `data.json`.
2. Device 2, independently, edits the title of task C and syncs: pushes it to Todoist, updates the recorded synced title for C in its own `data.json`.
3. Neither device has received the other's `data.json` update yet.
4. The vault-sync tool reconciles `data.json` as one file; by last-write-wins, Device 1's copy (say) becomes the surviving version everywhere.
5. Device 2's recorded-synced-title update for task C is discarded, even though task C's new title already reached Todoist.
6. A later pass compares the note's current text for task C, which already shows the new title, against `data.json`'s stale recorded title for task C, and sees a mismatch.
7. The pass treats task C as "changed locally again" and pushes the same, already-current title to Todoist a second time.
8. Outcome: one redundant, idempotent push — no data lost.

## Case 6 — Whole-file overwrite on data.json, overlapping a real remote edit
1. Steps 1 through 6 of case 5 happen, for a task D.
2. In that same window, a real, independent edit to task D's title happens in Todoist — for example, made from the Todoist mobile app.
3. A later pass reads: the note's current text for task D, the reverted, stale recorded title for task D in `data.json`, and Todoist's current title plus its live last-modified timestamp.
4. The pass detects a genuine disagreement between the local text and the remote title.
5. Feature 5's recency rule compares the live note file's last-modified time against Todoist's live last-modified timestamp — neither of which was touched by the `data.json` overwrite, since neither is cached in `data.json`.
6. The correct winner, whichever edit is actually more recent, is chosen regardless of what `data.json`'s stale recorded title said.
7. Outcome: self-heals correctly, specifically because the recency signals are read live rather than trusted from `data.json`'s cached state.

## Case 7 — Whole-file overwrite on the note — the hard floor
1. Device 1 edits one or more lines in the note and saves.
2. Device 2, without having received Device 1's edit yet, independently edits the note (the same or different lines) and saves.
3. Neither sync pass has reconciled the two copies yet.
4. The vault-sync tool reconciles the note as one file; last-write-wins picks one full copy, say Device 2's, as the sole survivor.
5. All of Device 1's edits to the note are gone — not merged, not compared, never written to the surviving file.
6. Any later sync pass, on either device, only ever sees the surviving copy; it has no record that Device 1's edits ever existed.
7. Outcome: silent, permanent data loss at the vault-sync layer, before any plugin logic — Feature 5 included — ever runs.

## Case 8 — A conflict copy of the note instead of an overwrite
1. Same starting point as case 7: Device 1 and Device 2 each edit the note independently before the vault-sync tool reconciles.
2. Instead of picking one survivor, the vault-sync tool keeps both: one copy stays at the configured note path, the other is written under a different filename — for example, a filename like "Tasks (conflicted copy, Device 2, 2026-09-11).md".
3. The plugin's sync pass only ever reads the file at the configured note path.
4. The edits captured in the conflict-copy file are never read by any sync pass.
5. Outcome: nothing is silently overwritten, but nothing is "resolved automatically" either — the losing edits sit inert until a person notices the extra file and merges it by hand.

## Case 9 — A conflict copy of data.json instead of an overwrite
1. Same starting point as case 5 and case 6, but the vault-sync tool's policy for `data.json` is to keep both copies rather than overwrite one.
2. One copy of `data.json` remains at the real path; the other is written out separately, or simply never applied at the real path at all.
3. The plugin only ever loads the `data.json` file at the real path, at startup and at the top of each pass.
4. The other device's link and title updates, captured only in the extra copy, are never read.
5. Outcome: the same practical effect on future passes as case 5 or case 7 for `data.json` — that device's updates don't take effect — except nothing is destroyed; the state is inert until a person notices and merges it.

## Case 10 — A torn write during propagation
1. Device 1, or the plugin's own atomic note-writing routine, is in the middle of writing the note or `data.json` to disk.
2. The vault-sync tool begins copying that file to propagate it to Device 2 at that exact moment, before the write finishes.
3. Device 2 receives a partially written file — for example, truncated JSON for `data.json`, or a note cut off in the middle of a line.
4. A sync pass runs on Device 2 against this partial file.
5. For `data.json`: the link store's loading routine parses the JSON; anything malformed enough to fail the expected shape is dropped rather than trusted, per its existing tolerant-parsing design.
6. For the note: a truncated line most likely fails the task-line pattern match and is skipped as a non-task line rather than corrupting data.
7. Outcome: lower risk than the other cases, since the existing defensive parsing absorbs most of the damage — but still a real interleaving hazard unique to two writers touching the same file at nearly the same time.

## Case 11 — Both devices resolve the same conflict independently
1. Task E has a title disagreement: the note's text differs from the recorded synced title, and Todoist's current title for task E also differs from the recorded synced title.
2. Device 1 and Device 2 can each observe this same disagreement — for example, each has been offline from the other but online to Todoist.
3. Device 1 runs a sync pass: reads its own note file's last-modified time for that line, and Todoist's live last-modified timestamp for task E, and picks a winner by comparing the two.
4. Device 2, independently, runs its own pass: reads its own, possibly different, note file's last-modified time, and the same Todoist last-modified timestamp for task E, and picks a winner the same way.
5. Because the remote timestamp is identical on both devices, they only reach different conclusions if their own local last-modified times fall on opposite sides of that remote timestamp.
6. Common case: both local last-modified times are on the same side of the remote timestamp, so both devices reach the same winner and converge without issue.
7. Narrower case: the local last-modified times straddle the remote timestamp, so the two devices briefly disagree on the winner until the vault-sync tool next reconciles `data.json` and a later pass re-settles on one outcome.

## Case 12 — Clock skew on one device
1. Device 1's system clock is inaccurate relative to real time, and therefore relative to Todoist's server clock — for example, running several minutes fast or slow.
2. The user edits a line in the note on Device 1; the operating system stamps the file's last-modified time using Device 1's skewed clock.
3. A conflicting edit happens on the same task in Todoist at some real, correct time.
4. Device 1's sync pass compares its skewed local last-modified time against Todoist's correct last-modified timestamp.
5. Because the local timestamp is systematically offset, the comparison can come out wrong regardless of which edit actually happened first in real time.
6. Outcome: the recency rule's correctness silently depends on each device's own clock accuracy; one mis-set clock degrades every conflict resolution run from that device, not just one.

## Where Feature 5's recency mechanism stands per case

- **Actually helps:** case 6 and case 11 (and the plain single-device conflict).
- **Bystander, for better or worse:** cases 1, 3, 5, and 10 — these self-heal or are harmless regardless of what Feature 5 does.
- **Powerless — the damage happens before any sync pass runs:** cases 2, 4, 7, 8, and 9.
- **The wrong tool for the job — a signal-quality problem, not a resolution-policy problem:** case 12.

Cases 2, 4, 7, 8, and 9 are all instances of the same root cause already
named in the README's Feature 4 "Known limitations": the note and
`data.json` are two separate files, and nothing keeps them consistent as a
pair. Feature 5 was never scoped to fix that — it adjudicates a title
disagreement between two states that arrived correctly; it has no way to
tell whether they arrived correctly in the first place.

## Cases specific to a source scope wider than one note (a tag, or a folder / the whole vault)

Context: these cases assume the source of synced tasks is no longer one
fixed note, but instead every task matching a chosen tag anywhere in the
vault, or every task in a chosen folder (up to the whole vault). This is not
the plugin's current architecture — the source is fixed to a single
configured note — but is considered here as a hypothetical widening, to
check whether the cases above still hold.

## Case 13 — A whole task is invisible to one device, not just a race on its content
1. The user creates a new task, or adds the qualifying tag to an existing task, in a note on Device 1.
2. Device 1 runs a sync pass and creates the task in the task provider, writes the block id, and records the link in `data.json`, exactly as usual.
3. The vault-sync tool has not yet propagated that note (or, for a tag-based source, the edit adding the tag) to Device 2 at all.
4. A sync pass runs on Device 2 in that window.
5. Device 2's scan of its own currently-visible notes, or its own currently-visible tags, simply does not include this task — not because any one file is caught mid-transfer, but because the file, or the edit that makes the task qualify, has not arrived yet.
6. Outcome: Device 2 does nothing for this task this pass. Self-heals once the note (or the tag edit) propagates — but unlike a single fixed note, where the one file always exists on both devices even if its content is stale, here a task's very existence in the source set can be transiently one-sided.

## Case 14 — Losing eligibility races against an edit to the same line
1. Device 1 removes the qualifying tag from a task, or moves its note out of the watched folder, intending to stop it from syncing.
2. Device 2, independently, edits that same line's title before the two devices reconcile.
3. The vault-sync tool reconciles the note as one file, the same whole-file last-write-wins as case 7.
4. If Device 2's version wins, Device 1's tag removal (or move) is discarded along with everything else about its edit — the task stays in scope, whether or not that was still wanted.
5. If Device 1's version wins, Device 2's title edit is discarded, and the task drops out of scope in the same stroke.
6. Outcome: with a single fixed source note, a line's presence in that one file never changes what "in scope" means — losing a file-level race only ever costs an edit. Here, losing the same race can also flip whether a task is synced at all, a consequence a fixed single note never has to account for.

## Case 15 — Two devices independently mint the same block id in two different notes
1. Minting a fresh block id only has to avoid the ids already used in the one note just read.
2. With many source notes, that avoidance would need to hold across the whole scanned set, but each device only ever checks the notes it currently has.
3. Device 1 creates a new task in note A and mints a fresh block id for it.
4. Device 2, independently, creates a different new task in note B and happens to mint the identical block id string.
5. Both devices record that block id in their own `data.json`, each pointing at a different task.
6. The vault-sync tool propagates both notes and both `data.json` files; `data.json`'s links are keyed by block id alone.
7. Outcome: reconciling the two devices' `data.json` conflates two entirely unrelated tasks under one entry — a new failure mode a single source note cannot produce, since a block id only ever had to be unique within the one file being read.

## Case 16 — A vault-sync conflict copy becomes a second, independent source of tasks
1. The vault-sync tool resolves a conflict on some note by keeping a conflict copy rather than overwriting (as in case 8), typically under the original filename with a suffix inserted, in the same folder.
2. With a single fixed source note, the plugin only ever reads the one configured path, so a conflict copy is invisible by construction.
3. With a folder- or vault-wide scan, that conflict-copy file sits inside the scanned area (or, for a tag-based source, still carries whatever tags the note had), so it is picked up as its own, independent note to scan.
4. The conflict copy carries the same block id, on the same line, as the original note's surviving version.
5. A sync pass now sees that one block id twice in the same pass, once in each file.
6. Outcome: a note-level conflict elsewhere in the vault can leak a duplicate task line straight into the sync, rather than sitting inertly ignored the way it does for a single fixed source note.

## Case 17 — Orphan detection cannot tell "genuinely gone" from "not visible to this device yet"
1. Whether a block id is missing from every currently-scanned note because the task was genuinely removed from scope, or because case 13's file-existence skew or case 14's mid-flight tag/folder change has left it transiently invisible to this device, looks identical from inside a single sync pass.
2. A single fixed source note does not have this ambiguity: there is exactly one file to check, and the vault-sync tool eventually delivers a coherent copy of it, so a missing block id only ever means the line was actually removed.
3. With a tag- or folder-based source, the set of qualifying notes, and even which notes currently carry the qualifying tag, can itself be transiently incomplete on one device.
4. Outcome: this raises the stakes of the same ambiguity already named in case 3's self-healing — here, the same kind of transient gap risks being read as a genuine removal by an orphan-flagging mechanism, rather than quietly resolving itself.
