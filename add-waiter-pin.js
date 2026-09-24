import { sequelize } from "./src/lib/db.js";
import { SubAdmin } from "./src/models/SubAdmin.js";

async function fix() {
  try {
    await sequelize.query('ALTER TABLE "SubAdmins" ADD COLUMN "waiterPin" VARCHAR(255) DEFAULT \'\';');
    console.log("Column added successfully!");
  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('Duplicate column')) {
      console.log("Column already exists.");
    } else {
      console.error(error);
    }
  } finally {
    process.exit(0);
  }
}

fix();
