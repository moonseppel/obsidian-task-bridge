# Contributing

Thanks for your interest in TaskBridge!

## Setup

```sh
npm install
npm run dev     # watch build
npm run build   # type-check and production build
```

## Tests

```sh
npm test                  # offline suite
npm run test:integration  # live Todoist suite
```

The integration suite needs a Todoist API token in `OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN`. Use a throwaway account, since the tests create and delete tasks.

## Guidelines

- Read the [style guide](docs/coding-guides/style_guide.md), the [Obsidian rules](docs/coding-guides/obsidian-rules.md) and the architecture rules in [docs/features/architecture](docs/features/architecture) before writing code.
- Follow Clean Code: simple over clever, no speculative features, intention-revealing names, small functions that do one thing, and comments only for a non-obvious why.
- Work in small slices that each build, pass their tests and can be committed on their own; `npm run test:all` must pass before a feature is done.
- Tests and plugin runs should produce no errors, deprecations or warnings in the logs.
- Log through the `Logger` utility, never `console.*`, at the level the event means for the user, and never log secrets or note contents.
- Never commit credentials, and sanitize every input from an external source before processing it.
- Keep the feature's `spec.md` and the README up to date.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) and are checked by commitlint.
- Open an issue before starting on a larger change.

## License

By contributing, you agree that your contributions are licensed under the [MPL-2.0](LICENSE).
