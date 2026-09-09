/**
 * Reaches the real Todoist API. Part of `npm test`, and so of the pre-commit hook too.
 * `globalSetup` fails the run when OBSIDIAN_TASK_SYNC_TODOIST_API_TOKEN is missing, rather
 * than skipping, so the guard against Todoist changing its API is never silently unarmed.
 * Obsidian is deliberately left unmapped: these tests must not touch app-only code.
 */

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__integration__/**/*.test.ts'],
  globalSetup: '<rootDir>/jest.integration.setup.js',
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
