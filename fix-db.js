import { sequelize } from "./src/lib/db.js";
import { MenuItem } from "./src/models/MenuItem.js"; // just to ensure it's loaded

async function fix() {
  try {
    await sequelize.query('ALTER TABLE "MenuItems" ADD COLUMN "foodType" VARCHAR(255) DEFAULT \'veg\';');
    console.log("Column added successfully!");
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log("Column already exists.");
    } else {
      console.error(error);
    }
  } finally {
    process.exit(0);
  }
}

fix();
