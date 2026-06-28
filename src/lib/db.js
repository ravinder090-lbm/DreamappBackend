import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

import pg from "pg";

console.log("PG Loaded:", !!pg);

const databaseUrl = process.env.DATABASE_URL;

export const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  dialectModule: pg,
  logging: false,
});


export async function connectDB() {
  try {
    await sequelize.authenticate();
    console.log("PostgreSQL connected successfully.");
    
    // Dynamically import models to resolve ESM circular dependency TDZ
    await import("../models/SuperAdmin.js");
    await import("../models/SubAdmin.js");
    await import("../models/User.js");
    await import("../models/Category.js");
    await import("../models/MenuItem.js");
    await import("../models/Banner.js");
    await import("../models/Table.js");
    await import("../models/Order.js");
    await import("../models/Task.js");

    await sequelize.sync({ alter: true });
    console.log("Database tables synchronized.");
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    throw error;
  }
}
