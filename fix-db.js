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
    await sequelize.query('ALTER TABLE "SubAdmins" ADD COLUMN IF NOT EXISTS "publicMenuTheme" VARCHAR(255) DEFAULT \'default\';');
    console.log("Column 'publicMenuTheme' added successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error adding column:", error);
    process.exit(1);
  }
}

fix();
