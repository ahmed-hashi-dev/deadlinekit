export type DeadlineBudgetOptions = {
  timeoutMs: number;
};

export type RunOptions<T> = {
  timeoutMs?: number;
  fallback?: T;
};

export type DeadlineExceededReason = "budget already expired" | "step timeout";

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
    const availableMs = remainingMs();

    if (availableMs <= 0) {
      if ("fallback" in runOptions) {
        return runOptions.fallback as T;
      }

      throw new DeadlineExceededError(name, "budget already expired");
    }

    const timeoutMs = Math.min(runOptions.timeoutMs ?? availableMs, availableMs);
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      controller.abort(new DeadlineExceededError(name, "step timeout"));
    }, timeoutMs);

    try {
      return await operation(controller.signal);
    } catch (error) {
      if ("fallback" in runOptions && isAbortError(error)) {
        return runOptions.fallback as T;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    run,
    remainingMs,
  };
}