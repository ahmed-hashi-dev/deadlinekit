import { describe, expect, it } from "vitest";
import {
  createDeadlineBudget,
  DeadlineExceededError,
  isAbortError,
} from "../src/index.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const timeoutId = setTimeout(() => {
      resolve();
    }, ms);

    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeoutId);
        reject(signal.reason);
      },
      { once: true }
    );
  });
}

describe("createDeadlineBudget", () => {
  it("returns a positive remaining time after creation", () => {
    const budget = createDeadlineBudget({ timeoutMs: 100 });

    expect(budget.remainingMs()).toBeGreaterThan(0);
    expect(budget.remainingMs()).toBeLessThanOrEqual(100);
  });

  it("decreases remaining time over time", async () => {
    const budget = createDeadlineBudget({ timeoutMs: 100 });

    const before = budget.remainingMs();

    await sleep(20);

    const after = budget.remainingMs();

    expect(after).toBeLessThan(before);
  });

  it("returns the operation result when it finishes before timeout", async () => {
    const budget = createDeadlineBudget({ timeoutMs: 100 });

    const result = await budget.run(
      "fast-operation",
      { timeoutMs: 50 },
      async (signal) => {
        await abortableSleep(10, signal);
        return "success";
      }
    );

    expect(result).toBe("success");
  });

  it("passes an AbortSignal to the operation", async () => {
    const budget = createDeadlineBudget({ timeoutMs: 100 });

    const result = await budget.run(
      "signal-operation",
      { timeoutMs: 50 },
      async (signal) => {
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal.aborted).toBe(false);
        return "success";
      }
    );

    expect(result).toBe("success");
  });

  it("throws DeadlineExceededError when the operation exceeds timeout", async () => {
    const budget = createDeadlineBudget({ timeoutMs: 100 });

    await expect(
      budget.run("slow-operation", { timeoutMs: 10 }, async (signal) => {
        await abortableSleep(50, signal);
        return "done";
      })
    ).rejects.toMatchObject({
      name: "DeadlineExceededError",
      operationName: "slow-operation",
      deadlineReason: "step timeout",
    });
  });

  it("returns fallback when operation times out and fallback is provided", async () => {
    const budget = createDeadlineBudget({ timeoutMs: 100 });

    const result = await budget.run(
      "slow-operation-with-fallback",
      {
        timeoutMs: 10,
        fallback: "fallback-value",
      },
      async (signal) => {
        await abortableSleep(50, signal);
        return "real-value";
      }
    );

    expect(result).toBe("fallback-value");
  });

  it("does not run an operation when the total deadline is already exceeded", async () => {
    const budget = createDeadlineBudget({ timeoutMs: 10 });

    await sleep(20);

    await expect(
      budget.run("expired-operation", {}, async () => {
        return "should-not-run";
      })
    ).rejects.toMatchObject({
      name: "DeadlineExceededError",
      operationName: "expired-operation",
      deadlineReason: "budget already expired",
    });
  });

  it("returns fallback when total deadline is already exceeded", async () => {
    const budget = createDeadlineBudget({ timeoutMs: 10 });

    await sleep(20);

    const result = await budget.run(
      "expired-operation-with-fallback",
      {
        fallback: "expired-fallback",
      },
      async () => {
        return "should-not-run";
      }
    );

    expect(result).toBe("expired-fallback");
  });

  it("identifies DeadlineExceededError as an abort error", () => {
    const error = new DeadlineExceededError("test-operation", "step timeout");

    expect(isAbortError(error)).toBe(true);
  });

  it("identifies AbortError as an abort error", () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";

    expect(isAbortError(error)).toBe(true);
  });
});