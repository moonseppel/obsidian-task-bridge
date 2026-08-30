# Obsidian Task Sync

An Obsidian plugin that synchronizes task checkboxes between Obsidian notes and a cloud task management platform.

## Features

- **Partial two-way sync**: All Obsidian tasks are pushed to the task manager; tasks that originated in Obsidian sync back two-way
- **Non-commercial open-source**: Licensed under AGPL-3.0-or-later
- **Error handling**: Explicit failure reporting with user-friendly notifications
- **Mobile access**: Manage tasks from anywhere via your task manager

## Status

**Feature 1: Complete** — "Hello World" plugin: lifecycle hooks, error handling, and build infrastructure (esbuild, TypeScript strict mode, Jest testing). Next: Feature 2 — Todoist provider and sync engine.

## Installation

1. Clone this repository
2. Run `npm install`
3. Build with `npm run build`
4. Copy `dist/main.js` and `manifest.json` to your Obsidian test vault

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Obsidian (for testing)

### Scripts

- `npm run dev` — Watch mode for development
- `npm run build` — Production build
- `npm test` — Run test suite
- `npm run test:watch` — Run tests in watch mode

### Project Structure

```
src/
  main.ts           # Plugin entry point
  utils/
    logger.ts       # Logging utility
  __tests__/        # Jest tests
  __mocks__/        # Mock definitions for testing

dist/               # Built plugin (generated)
manifest.json       # Obsidian plugin metadata
```

## Architecture

The plugin uses a provider abstraction pattern to support multiple task managers. Future versions will include:

- Task manager provider interface
- Local metadata for task identity mapping
- Sync state tracking to prevent duplicates
- Clear error handling and user feedback

## License

AGPL-3.0-or-later — Free for non-commercial use. Commercial licensing available upon request.

## Testing

All changes must pass the test suite:

```bash
npm test
```

Tests cover:
- Plugin structure and lifecycle hooks
- Error handling and graceful failure
- Logger functionality
