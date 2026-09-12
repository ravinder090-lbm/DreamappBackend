import { sequelize } from "./lib/db.js";

async function addIndexes() {
  try {
    console.log("Adding indexes to PostgreSQL tables for lightning fast queries...");
    await sequelize.authenticate();
    
    // Add indexes for subAdminId
    await sequelize.query('CREATE INDEX IF NOT EXISTS "idx_tables_subadminid" ON "Tables" ("subAdminId");');
    await sequelize.query('CREATE INDEX IF NOT EXISTS "idx_categories_subadminid" ON "Categories" ("subAdminId");');
    await sequelize.query('CREATE INDEX IF NOT EXISTS "idx_menuitems_subadminid" ON "MenuItems" ("subAdminId", "available");');
    await sequelize.query('CREATE INDEX IF NOT EXISTS "idx_banners_subadminid" ON "Banners" ("subAdminId");');
    await sequelize.query('CREATE INDEX IF NOT EXISTS "idx_orders_subadminid" ON "Orders" ("subAdminId");');
    await sequelize.query('CREATE INDEX IF NOT EXISTS "idx_orders_subadmin_created" ON "Orders" ("subAdminId", "createdAt" DESC);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS "idx_orders_subadmin_status" ON "Orders" ("subAdminId", "status");');
    await sequelize.query('CREATE INDEX IF NOT EXISTS "idx_orders_phone_created" ON "Orders" ("customerPhone", "createdAt" DESC);');
    
    console.log("Indexes added successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error creating indexes:", error);
    process.exit(1);
  }
}

addIndexes();
