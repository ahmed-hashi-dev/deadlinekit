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
    "slow-api-call",
    {
      timeoutMs: 100,
      fallback: "Fallback result from cache",
    },
    async (signal) => {
      await abortableSleep(300, signal);
      return "Real API result";
    }
  );

  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});