import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL_TRANSACTION || process.env.DATABASE_URL;

const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

async function fix() {
  try {
    await sequelize.authenticate();
    console.log("Connected to DB.");
    await sequelize.query('ALTER TABLE "SubAdmins" ADD COLUMN IF NOT EXISTS "waiterTone" TEXT DEFAULT \'default\';');
    await sequelize.query('ALTER TABLE "SubAdmins" ADD COLUMN IF NOT EXISTS "orderTone" TEXT DEFAULT \'default\';');
    console.log("Columns 'waiterTone' and 'orderTone' added successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error adding columns:", error);
    process.exit(1);
  }
}

fix();
