import { describe, expect, it } from "vitest";
import { createDeadlineBudget } from "../src/index";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
      async () => {
        await sleep(10);
        return "success";
      }
    );

    expect(result).toBe("success");
  });

  it("throws when the operation exceeds timeout", async () => {
    const budget = createDeadlineBudget({ timeoutMs: 100 });

    await expect(
      budget.run("slow-operation", { timeoutMs: 10 }, async () => {
        await sleep(50);
        return "done";
      })
    ).rejects.toThrow("Operation timed out: slow-operation");
  });

  it("returns fallback when operation times out and fallback is provided", async () => {
    const budget = createDeadlineBudget({ timeoutMs: 100 });

    const result = await budget.run(
      "slow-operation-with-fallback",
      {
        timeoutMs: 10,
        fallback: "fallback-value",
      },
      async () => {
        await sleep(50);
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
    ).rejects.toThrow("Deadline exceeded before running operation: expired-operation");
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
});