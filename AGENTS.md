# Agent Instructions

## Package Manager
Use **npm**: `npm install`, `npm test`, `npm run check`

## File-Scoped Commands
| Task | Command |
|------|---------|
| Typecheck | `npx tsc --noEmit` |
| Lint | `npx biome check path/to/file.ts` |
| Lint fix | `npx biome check --fix path/to/file.ts` |
| Test file | `npx vitest run path/to/file.test.ts` |
| Test watch | `npx vitest path/to/file.test.ts` |
| All checks | `npm run check` |

## Commit Attribution
Never add `Co-Authored-By` trailers or any AI attribution to commit messages.

## TypeScript Rules

### No `any` — zero tolerance
- `any` is banned in production code (enforced by biome)
- Use `unknown` + type narrowing, Zod schemas, or generics
- Test files may use `any` sparingly for stubs

### Prefer type inference
- Never annotate what the compiler already knows
- No return type annotations — let TS infer them
- Justified exceptions: type predicates (`x is T`), factory functions that widen initial values, discriminated union returns needed for narrowing, and public API contracts
- No redundant variable annotations: `const x = 'hello'` not `const x: string = 'hello'`
- Annotate function parameters and public API contracts only

### Functional patterns — non-negotiable
- **No classes** — ever. Use plain functions, closures, and data objects
- Default to pure functions: same input → same output, no side effects
- Push side effects (I/O, time, randomness) to the edges — pass them as arguments
- Use `readonly` for all data types — mutable state is the exception, not the default
- Impure shell, pure core (sandwich architecture)
- Factory functions with closures for stateful behavior (not classes)
- Use discriminated unions for variants, not inheritance
- Prefer `ReadonlyArray<T>` and `Readonly<T>` in type signatures
- Functions return new data, never mutate arguments

### Object params for 2+ arguments
```ts
// ✗
function run(name: string, model: string) {}
// ✓
function run(params: { readonly name: string; readonly model: string }) {}
```

### Data over state
```ts
// ✗ class with mutable state
class MetricsTracker {
  private turns = 0;
  addTurn() { this.turns++; }
}

// ✓ factory function with closure
function createMetricsTracker() {
  let turns = 0;
  return {
    addTurn: () => { turns++; },
    snapshot: () => ({ turns }),
  };
}

// ✓ or better — pure accumulator
function addTurn(metrics: Readonly<Metrics>): Metrics {
  return { ...metrics, turns: metrics.turns + 1 };
}
```

### Code splitting
- 200 lines max per file — split when exceeded, no exceptions
- Split by cohesion: related functions stay together, unrelated concepts get their own file
- Feature folders over layer folders — group by domain, not by role
- No barrel files — direct imports only
- Export only what other modules consume
- After any refactor that changes APIs — grep for orphaned types/interfaces/consts

### Strict tsconfig is non-negotiable
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- Never loosen these flags — fix the code instead

### Validate external data at runtime
- Use Zod at system boundaries to validate + infer types from one schema
- Never `as SomeType` on unvalidated external data
- Agent `.md` frontmatter is external data — validate with Zod

### Modern TS patterns
- Discriminated unions over optional fields + boolean flags
- `satisfies` to validate literals without widening
- `as const` for literal tuples and config objects
- `unknown` in catch blocks — narrow before using
- Constrained generics (`extends`) over unconstrained `<T>`
- Utility types (`Pick`, `Omit`, `Partial`, `Record`) over manual redeclaration

## TDD Process

### Red → Green → Commit
1. Write a failing test first — run it, confirm red
2. Write the minimum code to pass — run it, confirm green
3. Commit test + implementation together

### Test quality rules
- Test behavior, not implementation details
- Every test must catch a real bug if it fails
- No testing trivial code
- No `class TestXxx` — use plain `describe`/`it` with vitest
- Pure function extraction is the #1 testing strategy

### Mocking rules
- Prefer `vi.spyOn` over `vi.mock`
- `vi.mock` is a last resort — only for modules that are entirely I/O
- Prefer fakes and real objects over mocks
- Never mock what you own
- If a test needs more than 2 mocks, refactor first

## Conventions
- ESM-only (`type: "module"`, `.js` extensions in imports)
- Colocate tests: `foo.ts` → `foo.test.ts` in same directory
- Types live next to the code that uses them
- Unused code is deleted, not commented out
- Feature folders: `src/discovery/`, `src/invocation/`, `src/rendering/`
- All exported types are `Readonly` — mutable internals stay unexported
- Functions are the unit of composition — not classes, not modules
- Every function should be testable in isolation without mocking its module
