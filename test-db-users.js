import { sequelize } from "./src/lib/db.js";

async function test() {
  try {
    const res = await sequelize.query('SELECT phone, name, "subAdminId" FROM "Users"');
    console.log("Users:", res[0]);
  } catch (err) {
    console.error("Query Error:", err.message);
  } finally {
    process.exit(0);
  }
}

test();
