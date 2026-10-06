import { sequelize } from "./src/lib/db.js";
import { DataTypes } from "sequelize";

async function run() {
  try {
    await sequelize.authenticate();
    await sequelize.query(`ALTER TABLE "SuperAdmins" ADD COLUMN "smtpEmail" VARCHAR(255);`).catch(e => console.log(e.message));
    await sequelize.query(`ALTER TABLE "SuperAdmins" ADD COLUMN "smtpPassword" VARCHAR(255);`).catch(e => console.log(e.message));
    console.log("Migration done");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
