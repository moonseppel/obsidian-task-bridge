# Update Dependencies

## Requirements
1. Every dependency is updated within its allowed version range (`npm update`), including every package pulled in by another one.
2. `@codemirror/state` stays at 6.5.0 and `@codemirror/view` at 6.38.6, the exact versions `obsidian` requires.
3. `obsidian` is pinned to 1.13.1 instead of `latest`.
4. `esbuild` is updated to 0.28, which clears its security advisory, and the build config keeps producing the same plugin.
5. `builtin-modules` is replaced by Node's own `builtinModules` from `node:module`, and the package is removed.
6. Node 24 is used everywhere: in `.nvmrc`, in `engines` in `package.json`, and via `@types/node` 24.
7. The release workflow uses `actions/checkout` v7, `actions/setup-node` v7 and `softprops/action-gh-release` v3.
8. `jest` and `@types/jest` are updated to 30.
9. `typescript` is updated to 6.0.3 and pinned only down to the minor version (`~6.0.3`), so it still gets bug-fix releases.
10. After each update, `npm run build` and `npm run test:all` pass.

## Non-Features
1. TypeScript 7 is not adopted, since `ts-jest` does not support it yet.
2. `@babel/core` stays on 7, since Jest 30 still requires it.
3. The `ES2022` target and lib in `tsconfig.json` stay unchanged.
