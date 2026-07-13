---
name: TS project references stale dist
description: Why @workspace/api-zod exports can appear "missing" to tsc even though the server runs fine
---

`lib/api-zod` (and similar workspace libs) are composite TS project references with `emitDeclarationOnly` into `dist/`. Runtime resolution uses `src/index.ts` directly, so the dev server works, but `tsc --noEmit` in a consumer (e.g. api-server) reads the built `dist/*.d.ts`.

**Why:** after regenerating `src/generated/api.ts`, the stale `dist` makes tsc report `TS2305: no exported member` for symbols that clearly exist in source.

**How to apply:** rebuild the reference with `pnpm exec tsc -b lib/api-zod` (no package `build` script exists), then re-run the consumer's type check.
