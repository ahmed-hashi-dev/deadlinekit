export type DeadlineBudgetOptions = {
  timeoutMs: number;
};

export type RunOptions<T> = {
  timeoutMs?: number;
  fallback?: T;
};

export function createDeadlineBudget(options: DeadlineBudgetOptions) {
  const startedAt = Date.now();
  const deadlineAt = startedAt + options.timeoutMs;

  function remainingMs() {
    return Math.max(0, deadlineAt - Date.now());
  }

  async function run<T>(
    name: string,
    runOptions: RunOptions<T>,
    operation: () => Promise<T>
  ): Promise<T> {
    const availableMs = remainingMs();
    const timeoutMs = Math.min(runOptions.timeoutMs ?? availableMs, availableMs);

    if (timeoutMs <= 0) {
      if ("fallback" in runOptions) {
        return runOptions.fallback as T;
      }

      throw new Error(`Deadline exceeded before running operation: ${name}`);
    }

    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out: ${name}`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation(), timeoutPromise]);
    } catch (error) {
      if ("fallback" in runOptions) {
        return runOptions.fallback as T;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  return {
    run,
    remainingMs,
  };
}