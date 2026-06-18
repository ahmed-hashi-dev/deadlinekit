import { createDeadlineBudget } from "../src/index";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const budget = createDeadlineBudget({ timeoutMs: 500 });

  const result = await budget.run("basic-operation", { timeoutMs: 100 }, async () => {
    await sleep(50);
    return "Operation completed successfully";
  });

  console.log(result);
  console.log("Remaining time:", budget.remainingMs(), "ms");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});