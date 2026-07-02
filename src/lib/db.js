import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

import pg from "pg";
import dns from "node:dns";

console.log("PG Loaded:", !!pg);

dns.setDefaultResultOrder("ipv4first");

// On Vercel (serverless), each function instance creates new DB connections.
// Use the transaction-mode pooler URL (port 6543 on Supabase) if available,
// which supports unlimited connections in transaction mode.
// Fall back to the session-mode URL (port 5432) for local dev.
const databaseUrl =
  process.env.DATABASE_URL_TRANSACTION || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or DATABASE_URL_TRANSACTION must be set.");
}

export const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
    // Disable prepared statements — required for PgBouncer transaction mode
    statement_timeout: 30000,
  },
  pool: {
    // Keep pool very small per serverless instance to avoid exhausting connections
    max: 2,
    min: 0,
    acquire: 30000,
    idle: 10000,
    evict: 10000,
  },
  // Disable prepared statements for PgBouncer transaction mode compatibility
  query: {
    raw: false,
  },
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
