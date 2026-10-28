import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { sequelize } = await import("./lib/db.js");

async function addTableTypeColumn() {
  try {
    console.log("Connecting to PostgreSQL...");
    await sequelize.authenticate();
    console.log("Connected successfully.");

    console.log("Adding column 'tableType' to 'Tables' table if not exists...");
    await sequelize.query(`
      ALTER TABLE "Tables" 
      ADD COLUMN IF NOT EXISTS "tableType" VARCHAR(255) DEFAULT 'table';
    `);

    // Also update any existing rows with NULL to 'table'
    await sequelize.query(`
      UPDATE "Tables" 
      SET "tableType" = 'table' 
      WHERE "tableType" IS NULL;
    `);

    console.log("Column 'tableType' added/verified successfully!");

    // Verify by querying columns of Tables
    const [columns] = await sequelize.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'Tables' AND column_name = 'tableType';
    `);
    console.log("Verified column details in DB:", columns);

    process.exit(0);
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  }
}

addTableTypeColumn();
