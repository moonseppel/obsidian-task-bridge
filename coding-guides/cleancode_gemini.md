# Clean Code Guidelines for AI Coding Agents

## Introduction
This document serves as the foundational instruction set for an AI coding agent. When generating, refactoring, or reviewing code, you must strictly adhere strictly to the following Clean Code principles, derived primarily from industry standards and the works of Robert C. Martin (Uncle Bob).

---

## 1. General Principles
*   **KISS (Keep It Simple, Stupid):** Code should be as simple as possible. Avoid unnecessary complexity.
*   **YAGNI (You Aren't Gonna Need It):** Never implement functionality until it is strictly required. Do not over-engineer for hypothetical future use cases.
*   **The Boy Scout Rule:** Leave the campground cleaner than you found it. Whenever you touch a file, try to improve its structure or readability slightly.

## 2. Naming Conventions
*   **Intention-Revealing:** Variables, functions, and classes must tell you why they exist, what they do, and how they are used. (e.g., `elapsedTimeInDays` instead of `d`).
*   **Pronounceable and Searchable:** Use words that humans can read and search for easily. Avoid arbitrary abbreviations.
*   **Avoid Encodings:** Do not use Hungarian notation or type prefixes (e.g., avoid `strName` or `iCount`).
*   **Parts of Speech:** 
    *   Classes and Objects should be Nouns or Noun Phrases (e.g., `Customer`, `AccountParser`).
    *   Functions and Methods should be Verbs or Verb Phrases (e.g., `postPayment`, `deletePage`).

## 3. Functions and Methods
*   **Smallness:** Functions should be small. Ideally, no more than 20 lines of code.
*   **Do One Thing:** A function should do one thing, do it well, and do it only. (Single Responsibility Principle).
*   **One Level of Abstraction:** All statements within a function should be at the same level of abstraction.
*   **Minimize Arguments:** Functions should have zero, one, or two arguments. Three is highly discouraged. More than three requires a very special justification (consider passing an object instead).
*   **No Flag Arguments:** Passing a boolean into a function loudly declares that the function does more than one thing. Split the function into two instead.
*   **No Side Effects:** Functions should not promise to do one thing but do other hidden things (like unexpectedly modifying global state or class state).

## 4. Comments
*   **Code as Documentation:** The best comment is no comment—refactor the code to make it self-explanatory.
*   **Explain Intent, Not Mechanics:** Only use comments to explain *why* something was done a certain way if it is non-obvious, not *what* the code is doing.
*   **Delete Commented-Out Code:** Never leave dead, commented-out code in the codebase. Version control will remember it.
*   **Avoid Noise:** Do not generate redundant docstrings or comments that restate the function signature.

## 5. Formatting and Structure
*   **Vertical Formatting:** Closely related concepts should be kept vertically close to each other. Variables should be declared as close to their usage as possible.
*   **Stepdown Rule (Newspaper Metaphor):** Code should read like a top-down narrative. High-level functions should be at the top, followed by the lower-level utility functions they call.

## 6. Error Handling
*   **Use Exceptions, Not Return Codes:** Do not return error flags or status codes (e.g., `-1` or `false`). Throw exceptions instead so the caller’s logic isn't cluttered with error checks.
*   **Don't Pass or Return Null:** Returning `null` forces the caller to implement null-checks and leads to `NullReferenceExceptions`. Use Optionals/Null Object Pattern instead. Never pass `null` into methods.

## 7. Objects and Data Structures
*   **Law of Demeter (Principle of Least Knowledge):** A module should not know about the innards of the objects it manipulates. (e.g., Avoid chained calls like `object.getChild().getGrandchild().doSomething()`).
*   **Hide Internal Structure:** Expose abstract behavior via interfaces or methods rather than exposing raw public data fields.

## 8. Testing
*   **F.I.R.S.T. Principles:** Tests must be Fast, Independent, Repeatable, Self-Validating, and Timely.
*   **One Assert per Test:** Strive for a single logical assertion per unit test to easily pinpoint failures.

---
*Agent Instruction: Read and process these rules. Acknowledge them before generating or modifying any code in this session. If any of your output violates these rules, automatically self-correct before returning the final response. If you are in doubt, inform the human.*
