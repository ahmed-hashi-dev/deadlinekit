import { createDeadlineBudget } from "../src/index.js";

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
  const budget = createDeadlineBudget({ timeoutMs: 500 });

  const result = await budget.run(
    "basic-operation",
    { timeoutMs: 100 },
    async (signal) => {
      await abortableSleep(50, signal);
      return "Operation completed successfully";
    }
  );

  console.log(result);
  console.log("Remaining time:", budget.remainingMs(), "ms");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});