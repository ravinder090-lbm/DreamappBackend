import { sequelize } from "./src/lib/db.js";
import { Lead } from "./src/models/Lead.js";

async function run() {
  try {
    await sequelize.authenticate();
    await Lead.sync({ alter: true });
    console.log("Lead table synced");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
