import { createDeadlineBudget } from "../src/index.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  const budget = createDeadlineBudget({ timeoutMs: 50 });

  await sleep(100);

  const result = await budget.run(
    "expired-operation",
    {
      fallback: "Deadline already expired, using fallback",
    },
    async () => {
      return "This should not run";
    }
  );

  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});