# DeadlineKit

DeadlineKit is an open-source SDK for managing request deadlines and latency budgets across backend services.

It helps developers keep requests within a defined time budget by tracking remaining time, applying operation-level deadlines, and supporting timeout, cancellation, and fallback behavior.

Instead of allowing one slow downstream call to consume the entire request time, DeadlineKit makes latency control explicit, predictable, and easier to test.

## Goals

* Define a total request deadline
* Track remaining time during execution
* Run async operations with per-step time limits
* Timeout slow operations safely
* Support fallback values
* Provide middleware for Node.js backend frameworks

## Example

```ts
import { createDeadlineBudget } from "deadlinekit";

const budget = createDeadlineBudget({ timeoutMs: 300 });

const user = await budget.run("get-user", {
  timeoutMs: 80,
  fallback: null,
}, async () => {
  return getUser(userId);
});
```

## Status

DeadlineKit is currently in early development.

The first release will focus on Node.js and TypeScript support.
