import { sequelize } from "./src/lib/db.js";

async function migrate() {
  try {
    await sequelize.query('ALTER TABLE "SubAdmins" ADD COLUMN IF NOT EXISTS "waiterName" VARCHAR(255) NOT NULL DEFAULT \'\';');
    await sequelize.query('ALTER TABLE "SubAdmins" ADD COLUMN IF NOT EXISTS "waiterPassword" VARCHAR(255) NOT NULL DEFAULT \'\';');
    console.log("Waiter credential columns are ready.");
  } catch (error) {
    console.error("Unable to add waiter credential columns:", error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
