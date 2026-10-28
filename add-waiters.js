import { sequelize } from "./src/lib/db.js";

async function migrate() {
  try {
    await sequelize.query(`
      ALTER TABLE "SubAdmins"
      ADD COLUMN IF NOT EXISTS "waiters" JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    await sequelize.query(`
      UPDATE "SubAdmins"
      SET "waiters" = jsonb_build_array(
        jsonb_build_object('name', "waiterName", 'password', "waiterPassword")
      )
      WHERE jsonb_array_length("waiters") = 0
        AND COALESCE("waiterName", '') <> ''
        AND COALESCE("waiterPassword", '') <> '';
    `);
    console.log("Multi-waiter credentials are ready.");
  } catch (error) {
    console.error("Unable to add multi-waiter credentials:", error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
