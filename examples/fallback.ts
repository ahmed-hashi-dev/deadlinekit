import { createDeadlineBudget } from "../src/index";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const budget = createDeadlineBudget({ timeoutMs: 500 });

  const result = await budget.run(
    "slow-api-call",
    {
      timeoutMs: 100,
      fallback: "Fallback result from cache",
    },
    async () => {
      await sleep(300);
      return "Real API result";
    }
  );

  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});