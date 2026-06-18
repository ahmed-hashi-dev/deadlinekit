import { consoleLogger, createDeadlineBudget } from "../src/index.js";

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

async function main() {
  const budget = createDeadlineBudget({
    timeoutMs: 300,
    onOperationEnd: consoleLogger,
  });

  await budget.run("fast-operation", { timeoutMs: 100 }, async (signal) => {
    await abortableSleep(50, signal);
    return "done";
  });

  await budget.run(
    "slow-operation",
    {
      timeoutMs: 50,
      fallback: "fallback result",
    },
    async (signal) => {
      await abortableSleep(200, signal);
      return "real result";
    }
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});