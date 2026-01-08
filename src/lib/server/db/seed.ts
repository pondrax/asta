import templates from "./data/templates";
import { db } from "./index";

async function main() {
  await db.query.templates.upsert({
    data: templates,
  });
}

main()
  .then(() => {
    console.log("Seed completed");
  })
  .catch((e) => {
    console.error("Seed failed", e);
  })
  .finally(() => {
    process.exit(0);
  });
