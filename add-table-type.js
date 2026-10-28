import { sequelize } from "./src/lib/db.js";

async function migrate() {
  try {
    await sequelize.query(`
      ALTER TABLE "Tables"
      ADD COLUMN IF NOT EXISTS "tableType" VARCHAR(20) NOT NULL DEFAULT 'table';
    `);
    await sequelize.query(`
      UPDATE "Tables"
      SET "tableType" = 'table'
      WHERE "tableType" IS NULL OR "tableType" NOT IN ('table', 'room');
    `);
    console.log("Table and room types are ready.");
  } catch (error) {
    console.error("Unable to add table and room types:", error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
