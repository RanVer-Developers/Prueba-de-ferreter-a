---
name: vitest
description: Vitest setup, test writing, and debugging for Node/TypeScript domain modules and React/Vite apps in pnpm monorepos.
---

# Vitest (Node/TypeScript + React/Vite)

Use this skill to configure, write, and run Vitest tests cleanly without wasting tokens on unrelated frameworks.

## Decision Tree
1. **What is under test?**
   - `@modulos/core-*` or pure TypeScript domain logic (Step 1) -> `environment: 'node'`. Avoid DOM dependencies.
   - React components / hooks (Step 2) -> `environment: 'jsdom'` or `'happy-dom'` with React Testing Library.
   - Monorepo (`packages/*`, `apps/*`) -> check root `pnpm-workspace.yaml` and existing `vitest.config.*` before creating new configs.
2. **Focus first:** Write or fix one focused test, run it in single-run mode (`--run`), then broaden to the full suite.

## Core Workflow
1. **Inspect first:** Check `package.json`, `vitest.config.*`, setup files, and path aliases (`tsconfig.json`).
2. **Keep tests behavioral:** Assert public outcomes, returned values, persisted repository state, and accessible UI output instead of private implementation details.
3. **Isolate state:** Reset mocks, fake timers, DOM, and in-memory repositories between tests (`afterEach(() => vi.restoreAllMocks())`).
4. **Never run watch mode in foreground:** Always pass `run` / `--run` (`pnpm vitest run` or `pnpm test`).

## Running Tests
- Single file: `pnpm vitest run path/to/file.test.ts`
- Filtered by name: `pnpm vitest run -t "formats currency"`
- Full workspace: `pnpm test` (executes `pnpm -r --if-present test`)

## React / Vite Setup
- Use `@testing-library/react` for component and hook tests.
- If using `toBeInTheDocument`, verify `@testing-library/jest-dom/vitest` is imported in the Vitest setup file.
- For async UI updates, use `findBy*` or `waitFor` instead of arbitrary sleeps.

## Writing Patterns
- Import `{ describe, it, expect, vi, beforeEach, afterEach }` explicitly from `vitest` (avoid enabling globals unless the project already uses them).
- Use `vi.fn()` for adapter/callback seams and `vi.spyOn()` / `vi.mock()` only at module boundaries.
- Use fake timers (`vi.useFakeTimers()`) for dates/timeouts and always restore (`vi.useRealTimers()`) in `afterEach`.
- Test monetary logic in integer cents (`*Cents`), boundary values (0, negative, rounding), invalid state transitions, and Zod schema validation errors.
- Avoid brittle snapshots; prefer explicit assertions on structured outputs.

## Common Failure Modes
- **Aliases fail:** Ensure `vitest.config.ts` resolves the same `tsconfig.json` / Vite aliases.
- **DOM APIs missing:** Set `environment: 'jsdom'` (or `'happy-dom'`) for React tests.
- **Mocks leak between tests:** Add `afterEach(() => vi.restoreAllMocks())` and create fresh `InMemory*Repository` instances in `beforeEach`.
- **CI vs local mismatch:** Check case-sensitive file paths (`git ls-files`), tracked fixtures, and Node/ESM module settings.
