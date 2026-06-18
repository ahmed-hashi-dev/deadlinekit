export type DeadlineExceededReason = "budget already expired" | "step timeout";

export interface OperationEndEvent {
  name: string;
  durationMs: number;
  timedOut: boolean;
  usedFallback: boolean;
  error: unknown;
  remainingBudgetMs: number;
}

export type DeadlineBudgetOptions = {
  timeoutMs: number;
  onOperationEnd?: (event: OperationEndEvent) => void;
};

export type RunOptions<T> = {
  timeoutMs?: number;
  fallback?: T;
};

export class DeadlineExceededError extends Error {
  public readonly operationName: string;
  public readonly deadlineReason: DeadlineExceededReason;

  constructor(operationName: string, deadlineReason: DeadlineExceededReason) {
    super(`[deadlinekit] "${operationName}" exceeded deadline: ${deadlineReason}`);

    this.name = "DeadlineExceededError";
    this.operationName = operationName;
    this.deadlineReason = deadlineReason;

    Object.setPrototypeOf(this, DeadlineExceededError.prototype);
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DeadlineExceededError) {
    return true;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }

  return false;
}

function emitOperationEnd(
  callback: ((event: OperationEndEvent) => void) | undefined,
  event: OperationEndEvent
): void {
  try {
    callback?.(event);
  } catch {
    // Observability callbacks must never break the request path.
  }
}

export function consoleLogger(event: OperationEndEvent): void {
  const status = event.timedOut ? "timeout" : event.error ? "error" : "ok";

  console.log(
    `[deadlinekit] ${event.name} ${status} in ${event.durationMs}ms ` +
      `(${event.remainingBudgetMs}ms remaining)`
  );
}

export function createDeadlineBudget(options: DeadlineBudgetOptions) {
  const startedAt = Date.now();
  const deadlineAt = startedAt + options.timeoutMs;

  function remainingMs(): number {
    return Math.max(0, deadlineAt - Date.now());
  }

  async function run<T>(
    name: string,
    runOptions: RunOptions<T>,
    operation: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const start = Date.now();
    let timedOut = false;
    let usedFallback = false;
    let error: unknown = null;

    const availableMs = remainingMs();

    if (availableMs <= 0) {
      timedOut = true;
      usedFallback = "fallback" in runOptions;

      const deadlineError = new DeadlineExceededError(
        name,
        "budget already expired"
      );

      emitOperationEnd(options.onOperationEnd, {
        name,
        durationMs: Date.now() - start,
        timedOut,
        usedFallback,
        error: deadlineError,
        remainingBudgetMs: 0,
      });

      if ("fallback" in runOptions) {
        return runOptions.fallback as T;
      }

      throw deadlineError;
    }

    const timeoutMs = Math.min(runOptions.timeoutMs ?? availableMs, availableMs);
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort(new DeadlineExceededError(name, "step timeout"));
    }, timeoutMs);

    try {
      return await operation(controller.signal);
    } catch (caughtError) {
      error = caughtError;

      if ("fallback" in runOptions && isAbortError(caughtError)) {
        usedFallback = true;
        return runOptions.fallback as T;
      }

      throw caughtError;
    } finally {
      clearTimeout(timeoutId);

      emitOperationEnd(options.onOperationEnd, {
        name,
        durationMs: Date.now() - start,
        timedOut,
        usedFallback,
        error,
        remainingBudgetMs: remainingMs(),
      });
    }
  }

  return {
    run,
    remainingMs,
  };
}