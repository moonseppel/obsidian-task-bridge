/**
 * Reaches the real Todoist API. Part of `npm test`, and so of the pre-commit hook too.
 * A missing OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN fails a test in the suite itself rather
 * than aborting the run, so the offline suite still gets to report while the guard against
 * Todoist changing its API stays armed.
 * Obsidian is deliberately left unmapped: these tests must not touch app-only code.
 */

/** @type {import('jest').Config} */
const config = {
  displayName: 'integration',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__integration__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testTimeout: 20000,
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
};

module.exports = config;
