# Clean Code Rules — Instructions for a Coding Agent

> **How to use this file:** Drop it into a repo (e.g. as `CLEAN_CODE.md`) and reference it from
> `AGENTS.md` / `CLAUDE.md` / `.cursorrules`, or paste it into the agent's system prompt.
> It is written as direct instructions to the agent.

---

## 0. Precedence — read this before any rule below

Apply these rules in this order. A lower-numbered item always overrides a higher-numbered one.

1. **Correctness, security, and data integrity.** No stylistic rule justifies a bug, a race
   condition, an injection hole, or silent data loss.
2. **The project's existing conventions.** If this codebase already has a style, a linter config,
   a formatter, or an established idiom, follow it. Consistency beats any external rulebook.
   Do not "clean up" a file into a different style than its neighbours.
3. **The language's own idioms.** These rules originate in a 2008 Java book. Where they conflict
   with idiomatic Go, Rust, Python, TypeScript, Elixir, or SQL, the language wins. See §9.
4. **The rules below.**
5. **Numeric thresholds.** All numbers in this document are defaults to be tuned, not hard limits.
   None of them are enforceable truths — see §10.

**Scope discipline:** only clean code you were asked to touch. Do not perform unrequested
refactors, do not reformat untouched files, and do not mix a refactor with a behaviour change in
the same commit. If you spot an unrelated problem, report it — do not fix it silently.

---

## 1. Naming

- Names must reveal intent. If a name needs an explanatory comment, the name has failed.
- Avoid disinformation: don't call something `accountList` unless it is actually a list.
- Make names meaningfully distinct. `Data`, `Info`, `Manager`, `Processor`, `Helper`, `Utils` as
  distinguishers carry no information — `ProductData` vs `ProductInfo` is a non-distinction.
- Use pronounceable, searchable names. Single letters are acceptable only for very short scopes
  (a loop index, a lambda parameter in a one-liner).
- No type or scope encoding in the name (no Hungarian notation, no `m_` prefixes,
  no `I` prefix on interfaces) unless the project already does it.
- Classes and types: noun phrases. Functions and methods: verb phrases.
- Pick one word per concept and hold it for the whole codebase: don't mix `fetch`, `get`, and
  `retrieve` for the same operation.
- Don't pun: don't reuse `add` for both "append to list" and "sum two numbers".
- Prefer domain vocabulary the users of the system would recognise. Where no domain term exists,
  use the precise computer-science term (`queue`, `visitor`, `debounce`).
- Add meaningful context by grouping into a class/namespace rather than by prefixing every
  variable (`addr_street`, `addr_city` → an `Address` type).
- Don't abbreviate beyond established, unambiguous conventions (`id`, `url`, `http` are fine;
  `calcRmndr` is not).

## 2. Functions

- **A function should do one thing**, at one level of abstraction, and do it well. This is the
  load-bearing rule of this section — more important than any length threshold.
- **Don't mix levels of abstraction** in one function. High-level orchestration and low-level
  byte-fiddling in the same body is the strongest single smell here.
- Keep functions small enough to be read in one screen without scrolling. Treat ~20–30 lines as a
  soft ceiling and a prompt to think, not a hard limit. See §10.1 before atomising anything.
- Argument counts: zero is ideal, one or two are fine, three needs a reason, four or more usually
  means an argument object is missing.
- **No flag arguments.** A boolean parameter that switches behaviour means the function is doing
  two things. Split it into two named functions.
- **No output arguments.** Return a value. If you must mutate, mutate the receiver/`this`, and make
  that obvious in the name.
- **Command–Query Separation.** A function either does something or answers something, never both.
  Avoid `if (setAndCheck(x))`.
- Extract nested try/catch bodies into their own functions; error handling is one thing, so a
  function that handles errors should do nothing else.
- Prefer exceptions (or a language-idiomatic `Result`/`Either`) to returning error codes that the
  caller must remember to check.
- Delete dead functions. Version control remembers them.
- No side effects hidden behind an innocent name. `checkPassword()` must not also initialise a
  session.
- Avoid duplication. Extract shared logic — but see §10.2 on when premature extraction hurts.

## 3. Comments

The intent behind these rules is: *a comment that restates the code is noise; a comment that
explains what the code cannot say is valuable.* Do not read this section as "never comment."

**Do not write:**
- Comments that restate what the code already says (`i++; // increment i`).
- Commented-out code. Delete it; version control has it.
- Changelogs, author names, ticket numbers, or dates in comments — that belongs in Git and the
  issue tracker.
- Redundant, misleading, or noise comments; closing-brace markers; banner clutter.
- Comments that compensate for a bad name. Fix the name instead.

**Do write:**
- The *why*, not the *what*: rationale, trade-offs, rejected alternatives.
- Warnings of consequence ("not thread-safe", "runs in O(n²), fine for n<100").
- Clarification of an interface you can't change (a weird third-party contract, a protocol quirk).
- Links to a spec, RFC, standard, or bug report that explains a non-obvious constraint.
- `TODO`s that are genuinely actionable — and keep them rare.
- Public API documentation (Javadoc/docstrings/rustdoc/JSDoc) where the project's conventions or
  tooling expect it. This is not "clutter"; it is the interface contract.

**Any comment you keep must be maintained.** An out-of-date comment is worse than none.

## 4. Formatting

- Run the project's formatter and linter. If one exists, it is the authority — do not hand-format
  against it, and do not add a formatter the project hasn't adopted.
- Vertical openness: blank lines between concepts, none inside a tightly-coupled block.
- Vertical density: related lines stay adjacent.
- Vertical distance: declare variables close to their use; keep caller and callee near each other;
  put related functions near one another.
- Newspaper structure: high-level first, details further down.
- Horizontal: keep lines within the project's limit (commonly 80–120 chars). Don't align
  assignments in columns.
- Indentation must reflect scope. Never collapse a block onto one line to save space.
- Every team member's output should look like one author wrote it.

## 5. Error Handling

- Error handling is one thing — it should not obscure the main logic.
- Use exceptions / `Result` types rather than magic return values or error codes.
- **Never swallow an exception.** No empty `catch` blocks. If you truly intend to ignore an error,
  say so in a comment explaining why, and log it.
- Provide context with every error: what operation failed, on what input, and why.
- Define exception classes around how the *caller* will handle them, not around how they were
  thrown. Wrap third-party exceptions at the boundary.
- **Don't return `null`.** Prefer an empty collection, an option type, or an exception.
- **Don't pass `null`** into functions as a matter of course. Where the language has non-nullable
  types or optionals, use them.
- Fail fast and loudly on programmer errors; degrade gracefully on expected operational failures.
  Know which one you are dealing with.
- Never write an error path you have not exercised at least once in a test.

## 6. Boundaries (third-party code)

- Wrap third-party APIs behind an interface you own. Don't let a vendor type spread through the
  codebase.
- Write **learning tests** — small tests that pin down the third-party behaviour you rely on. They
  double as an upgrade tripwire.
- Don't leak collection or ORM internals across a public API.
- Define the interface you *wish* you had for code that doesn't exist yet, then adapt.

## 7. Tests

- **Tests are production code.** They get the same naming, structure, and cleanliness standards.
  Dirty tests are worse than no tests because they rot and get deleted.
- **F.I.R.S.T.**: Fast, Independent (no ordering or shared-state dependencies), Repeatable (any
  environment, no network/clock/random flakiness), Self-validating (pass/fail, no manual reading of
  output), Timely (written with the code, not months later).
- One logical assertion — or at least one concept — per test. A test that verifies five unrelated
  things tells you nothing useful when it fails.
- Test names describe the behaviour and the condition, not the method name:
  `returnsEmptyCartWhenAllItemsExpire`, not `testGetCart2`.
- Structure each test as Arrange–Act–Assert (Given–When–Then).
- Cover boundary conditions explicitly: empty, single element, off-by-one, min/max, null/absent,
  duplicate, unicode, negative, overflow.
- Never delete or weaken a failing test to make a build green. Report it instead.
- Do not write tests that assert on incidental implementation detail; they punish refactoring.

## 8. Classes, Modules, and Design

- **Small, cohesive units.** A class whose fields are each used by only one method is not cohesive
  and probably wants splitting.
- **Single Responsibility Principle:** one reason to change. If you can't name a class without
  "and" or "Manager", it likely does too much.
- **Open/Closed:** extend behaviour without editing the existing tested body, where practical.
- **Liskov Substitution:** a subtype must be usable anywhere its supertype is, without surprises.
- **Interface Segregation:** many small client-specific interfaces beat one fat one.
- **Dependency Inversion:** depend on abstractions; keep concrete construction at the composition
  root (main / DI container / factory), out of business logic.
- **Law of Demeter / "Tell, Don't Ask":** talk to immediate collaborators only. Avoid
  `a.getB().getC().doThing()` train wrecks. Note the honest exception: this does not apply to
  fluent builders, LINQ/stream pipelines, or pure data structures (DTOs, records, JSON) — those
  legitimately expose their data.
- **Objects vs. data structures:** objects hide data and expose behaviour; data structures expose
  data and have no significant behaviour. Pick one per type; hybrids get the worst of both.
- **DRY** — remove duplication of *knowledge*, not of *characters*. Two identical lines that
  change for different reasons are not duplication. See §10.2.
- **YAGNI** — don't build for a requirement nobody has stated. No speculative abstraction layers,
  config switches, or plugin systems "for later".
- **KISS** — the simplest thing that fully solves the stated problem.
- **Four Rules of Simple Design**, in priority order: (1) all tests pass, (2) reveals intent,
  (3) no duplication, (4) fewest elements.
- **Boy Scout Rule:** leave code slightly better than you found it — within the scope you were
  already touching. Not a licence for drive-by refactors.

### Concurrency
- Keep concurrency code separate from the rest; it has its own reasons to change.
- Limit access to shared data; use the smallest possible critical sections.
- Prefer immutable data and message passing over shared mutable state and locks.
- Know your library's thread-safe (and *not*-thread-safe) types.
- Write tests that can expose timing problems; treat intermittent failures as real bugs, never as
  "flaky, just re-run it".

## 9. Language and paradigm adjustments (mandatory)

These rules were written for Java-style OOP in 2008. Adjust as follows, and prefer the language's
own convention where it differs:

- **Go:** returning explicit `error` values *is* the idiom — do not "fix" it into exceptions.
  Small interfaces defined at the consumer. Accept naming like `i`, `r`, `w`, `ctx`. Do not wrap
  primitives in types reflexively.
- **Rust:** `Result`/`Option` replace both null-returning and exceptions. Ownership rules often
  make "extract a tiny function" costly or impossible — do not fight the borrow checker for style.
- **Python:** EAFP over LBYL, context managers, and duck typing are idiomatic. PEP 8 and the
  project's formatter outrank §4. Docstrings are expected on public API and are not "noise".
- **TypeScript/JavaScript:** prefer discriminated unions and `strictNullChecks` over defensive
  null checks. Classes are optional; module-level functions are frequently the cleaner design.
- **Functional code:** "classes" and "objects vs. data structures" mostly do not apply. Purity,
  totality, and explicit effect handling are the equivalent goals.
- **SQL, shell, config, IaC:** most of this document does not apply. Follow the tooling's linter.
- **Performance-critical or embedded code:** see §10.1 — the abstraction advice here can be
  actively wrong in hot loops.

## 10. Contested rules — apply with judgement, do not apply dogmatically

This section exists because several widely-quoted "clean code rules" are genuinely disputed among
competent engineers. Treat them as trade-offs to reason about, not commandments.

### 10.1 "Functions should be tiny"
Martin's original text pushes functions toward a handful of lines. This is the single most
criticised piece of advice in the book. Splitting a coherent 40-line procedure into eight
three-line functions can *reduce* readability (you now have to jump between eight places to
understand one flow) and can measurably hurt performance in hot paths through indirection,
allocation, and lost locality. **Rule for you:** split when a function does more than one thing or
mixes abstraction levels. Do not split on line count alone. If a long function is linear,
top-to-bottom, and reads like a recipe, leaving it long is often the right call.

### 10.2 "Remove all duplication"
Premature deduplication couples call sites that had no reason to be coupled, and the shared helper
then grows flag arguments to serve them — which §2 forbids. Duplicate twice, extract on the third
occurrence, and only when the duplicated code represents the *same decision*, not merely the same
characters.

### 10.3 "Comments are a failure"
Taken literally this produces undocumented code with very long function names. The defensible
version is in §3: kill redundant comments, keep explanatory ones, always document public APIs.

### 10.4 "Prefer polymorphism to if/else and switch"
Replacing a local, readable switch with a class hierarchy scattered across files can make code
harder to follow and slower. Use polymorphism when new *types* are expected to be added often;
keep the switch when new *operations* are added more often, or when the set of cases is closed and
small. Exhaustive `match`/`switch` over a sealed type or enum is frequently the cleaner design.

### 10.5 Object Calisthenics (see §11)
Rules like "no `else` keyword", "one dot per line", "no getters/setters", "max two instance
variables" come from a *training exercise* explicitly designed to be extreme. They were never
intended for production code. **Do not apply them unless the project explicitly adopts them.**

### 10.6 Numeric limits generally
Every number in this file — 20 lines, 3 arguments, 120 characters — is a heuristic. None has strong
empirical backing. Use them as prompts to reflect, and let the project's linter be the only
mechanically enforced threshold.

## 11. Provenance — what actually comes from where

Verified attribution, because "the clean code rules" is a label applied to several separately
authored sources that are routinely conflated:

| Rule set | Actual source | Status in this file |
|---|---|---|
| Naming, Functions, Comments, Formatting, Error Handling, Boundaries, Unit Tests, Classes, Concurrency; the "Smells and Heuristics" catalogue (Ch. 17, items C1–C5, E1–E2, F1–F4, G1–G36, N1–N7, T1–T9) | Robert C. Martin, *Clean Code*, Prentice Hall, 2008 | §§1–8, paraphrased |
| SOLID (SRP, OCP, LSP, ISP, DIP) | Robert C. Martin, late 1990s papers; collected in *Agile Software Development: Principles, Patterns, and Practices* (2002). **Not** from *Clean Code*, though summarised there | §8 |
| DRY | Andrew Hunt & David Thomas, *The Pragmatic Programmer*, 1999 | §8 |
| Law of Demeter | Ian Holland et al., Northeastern University, 1987 (Demeter project) | §8 |
| Code smells (Duplicated Code, Long Method, Feature Envy, Shotgun Surgery, …) | Martin Fowler & Kent Beck, *Refactoring*, 1999 — Martin's Ch. 17 extends this list and credits it | §§2, 8 |
| Four Rules of Simple Design | Kent Beck, *Extreme Programming Explained*, 1999 | §8 |
| F.I.R.S.T. | *Clean Code*, Ch. 9 | §7 |
| Boy Scout Rule | *Clean Code* (Martin adapts the Scouting motto) | §8 |
| KISS | US Navy, 1960 — engineering folklore, not a software rule | §8 |
| YAGNI | Extreme Programming / Ron Jeffries | §8 |
| Object Calisthenics (9 rules: one indentation level, no `else`, wrap primitives, first-class collections, one dot per line, don't abbreviate, keep entities small, ≤2 instance variables, no getters/setters) | Jeff Bay, in *The ThoughtWorks Anthology*, Pragmatic Bookshelf, 2008. **An exercise for a ~1000-line practice project, not production guidance** | Deliberately excluded — see §10.5 |
| "Functions max 20 lines", "max 120 chars/line", "max 3 args" | Folklore hardened out of soft guidance; thresholds vary by source | §10.6 |

**Notable critiques**, so you know the disagreement is real and not fringe: Casey Muratori's
*"Clean" Code, Horrible Performance* and his subsequent long-form exchange with Martin (published
in Martin's own `cmuratori-discussion` repo); qntm's *It's probably time to stop recommending Clean
Code*; and John Ousterhout's *A Philosophy of Software Design*, which argues directly against the
tiny-function advice and is often recommended as the better modern starting point.

---

## 12. Agent checklist — run before declaring a task done

- [ ] Does every function I wrote do one thing, at one level of abstraction?
- [ ] Does every name state its intent without needing a comment?
- [ ] Did I add any comment that merely restates the code? Remove it.
- [ ] Any commented-out code, dead code, or leftover debug output? Remove it.
- [ ] Any swallowed exception or ignored error return? Fix or justify it.
- [ ] Any function returning or accepting `null`/`nil` where an option, empty value, or error would
      be clearer?
- [ ] Any flag argument or output argument I introduced?
- [ ] Do the tests cover the boundary conditions, not just the happy path?
- [ ] Did I run the project's formatter, linter, type checker, and full test suite?
- [ ] Did I stay inside the requested scope — no unrelated refactors, no reformatted neighbours?
- [ ] Is the diff reviewable: one concern per commit, refactor separated from behaviour change?
- [ ] Did I follow the existing codebase style over this document wherever they conflicted?
- [ ] **Did I flag, rather than silently resolve, anything ambiguous or any pre-existing problem I
      noticed?**

## 13. Reporting obligation

If following a rule in this document would make the code worse, slower in a way that matters, or
inconsistent with the surrounding codebase — **do not follow it silently and do not silently
ignore it.** State which rule, what the conflict is, and what you did instead.
