# DeadlineKit

Slow downstream calls should not be allowed to consume an entire request budget. DeadlineKit gives Node.js and TypeScript services a small deadline budget API for capping async operations, aborting work with `AbortSignal`, returning fallbacks, and observing what happened after each step.

## Install

```bash
npm install deadlinekit
```

## Quick start

```ts
import { createDeadlineBudget } from "deadlinekit";

const budget = createDeadlineBudget({ timeoutMs: 300 });

const user = await budget.run(
  "get-user",
  {
    timeoutMs: 80,
    fallback: null,
  },
  async (signal) => {
    return fetchUser(userId, signal);
  }
);
```

## How it works

### What happens when a step times out?

With a fallback, DeadlineKit returns the fallback value instead of throwing.

```ts
const user = await budget.run(
  "get-user",
  {
    timeoutMs: 80,
    fallback: null,
  },
  async (signal) => {
    return fetchUser(userId, signal);
  }
);

// null if it timed out
```

Without a fallback, DeadlineKit throws a `DeadlineExceededError`.

```ts
const user = await budget.run(
  "get-user",
  {
    timeoutMs: 80,
  },
  async (signal) => {
    return fetchUser(userId, signal);
  }
);

// throws DeadlineExceededError
```

### What happens when the total budget is already expired?

If the total budget is already expired, the operation is not called.

```ts
const budget = createDeadlineBudget({ timeoutMs: 10 });

await sleep(100);

const user = await budget.run(
  "get-user",
  {
    fallback: null,
  },
  async (signal) => {
    return fetchUser(userId, signal);
  }
);

// returns null immediately
// fetchUser is never called
```

Without a fallback, DeadlineKit throws a `DeadlineExceededError`.

### How do I check remaining time outside of a run call?

Use `remainingMs()`.

```ts
const remaining = budget.remainingMs();

// number of milliseconds left, or 0 if expired
```

Example:

```ts
if (budget.remainingMs() < 50) {
  return baseResponse;
}

const enriched = await budget.run("optional-enrichment", {}, async (signal) => {
  return loadOptionalEnrichment(signal);
});
```

## AbortSignal behavior

DeadlineKit passes an `AbortSignal` into every operation.

```ts
const data = await budget.run(
  "fetch-data",
  { timeoutMs: 100 },
  async (signal) => {
    const response = await fetch("/api/data", { signal });
    return response.json();
  }
);
```

`fetch` understands `AbortSignal`, so the request can actually be cancelled when the deadline expires.

But the signal only communicates cancellation. The operation must use it.

```ts
const data = await budget.run(
  "slow-thing",
  { timeoutMs: 100 },
  async (_signal) => {
    return someLegacyFunction();
  }
);
```

In this example, `someLegacyFunction()` ignores the signal. DeadlineKit can signal that the deadline expired, but the underlying work may continue running because the function does not support cancellation.

If you wrap a library that accepts an `AbortSignal`, pass the signal through. If the library does not accept one, the safest approach is to add your own abort-aware wrapper or fallback behavior.

## Observability

Use `onOperationEnd` to record metrics, logs, or tracing data after every operation.

The callback runs after a step succeeds, times out, uses a fallback, or throws.

```ts
const budget = createDeadlineBudget({
  timeoutMs: 300,
  onOperationEnd({
    name,
    durationMs,
    timedOut,
    usedFallback,
    remainingBudgetMs,
  }) {
    metrics.histogram("operation.duration_ms", durationMs, {
      operation: name,
    });

    if (timedOut) {
      metrics.increment("operation.timeout", {
        operation: name,
      });
    }

    if (usedFallback) {
      metrics.increment("operation.fallback", {
        operation: name,
      });
    }

    if (remainingBudgetMs < 20) {
      logger.warn({ operation: name }, "request budget nearly exhausted");
    }
  },
});
```

The callback is synchronous and fire-and-forget. If it throws, DeadlineKit catches the error so observability code does not break the request path.

### Built-in console logger

DeadlineKit also exports a small `consoleLogger` helper for local testing.

```ts
import { createDeadlineBudget, consoleLogger } from "deadlinekit";

const budget = createDeadlineBudget({
  timeoutMs: 300,
  onOperationEnd: consoleLogger,
});
```

Example output:

```text
[deadlinekit] get-user ok in 34ms (241ms remaining)
[deadlinekit] get-posts timeout in 80ms (161ms remaining)
```

## Error reference

DeadlineKit throws `DeadlineExceededError` when an operation exceeds a deadline and no fallback is provided.

```ts
import { DeadlineExceededError } from "deadlinekit";

try {
  await budget.run("get-user", { timeoutMs: 80 }, async (signal) => {
    return fetchUser(userId, signal);
  });
} catch (error) {
  if (error instanceof DeadlineExceededError) {
    console.log(error.operationName);
    console.log(error.deadlineReason);
  }

  throw error;
}
```

| Error                   | When it happens                                          | Useful fields                     |
| ----------------------- | -------------------------------------------------------- | --------------------------------- |
| `DeadlineExceededError` | The total budget is already expired before a step starts | `operationName`, `deadlineReason` |
| `DeadlineExceededError` | A step times out and no fallback is provided             | `operationName`, `deadlineReason` |

`deadlineReason` is one of:

```ts
"budget already expired" | "step timeout"
```

## API reference

### `createDeadlineBudget(options)`

Creates a deadline budget.

```ts
const budget = createDeadlineBudget({
  timeoutMs: 300,
  onOperationEnd: optionalCallback,
});
```

| Option           | Type                                 | Description                          |
| ---------------- | ------------------------------------ | ------------------------------------ |
| `timeoutMs`      | `number`                             | Total request budget in milliseconds |
| `onOperationEnd` | `(event: OperationEndEvent) => void` | Called after every `run()` completes |

### `budget.run(name, options, fn)`

Runs an async operation within the remaining budget.

```ts
const result = await budget.run(
  "operation-name",
  {
    timeoutMs: 100,
    fallback: fallbackValue,
  },
  async (signal) => {
    return doWork(signal);
  }
);
```

| Parameter           | Type                                  | Description                                         |
| ------------------- | ------------------------------------- | --------------------------------------------------- |
| `name`              | `string`                              | Label for this operation, used in errors and events |
| `options.timeoutMs` | `number?`                             | Per-step limit, capped at remaining budget          |
| `options.fallback`  | `T?`                                  | Returned on timeout instead of throwing             |
| `fn`                | `(signal: AbortSignal) => Promise<T>` | Async operation to run                              |

### `budget.remainingMs()`

Returns the remaining budget in milliseconds.

```ts
const remaining = budget.remainingMs();
```

Returns `0` if the budget has expired.

### `DeadlineExceededError`

Error thrown when a deadline is exceeded and no fallback is provided.

```ts
error.operationName;
error.deadlineReason;
```

### `isAbortError(error)`

Returns `true` for DeadlineKit deadline errors and standard abort errors.

```ts
if (isAbortError(error)) {
  // handle deadline or abort
}
```

### `consoleLogger(event)`

Simple logger for operation end events.

```ts
const budget = createDeadlineBudget({
  timeoutMs: 300,
  onOperationEnd: consoleLogger,
});
```

## Examples

Run the included examples locally:

```bash
npm run example:basic
npm run example:fallback
npm run example:expired
npm run example:logger
```

## Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test -- --run
```

Run typecheck:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

## Status and roadmap

DeadlineKit is early but usable. The current core supports:

* Total deadline budgets
* Per-operation timeouts
* AbortSignal support
* Fallback values
* Operation end events
* Built-in console logger
* TypeScript declarations
* Unit tests and runnable examples

Planned features:

* Express middleware
* Fastify middleware
* `budget.fork()` for parallel operations
* More framework examples
* More production observability examples

## License

MIT
