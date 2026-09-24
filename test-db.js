import { sequelize } from "./src/lib/db.js";

async function test() {
  try {
    const [res] = await sequelize.query('SELECT * FROM "SubAdmins" LIMIT 1');
    console.log("Columns:", Object.keys(res[0] || {}));
  } catch (err) {
    console.error("Query Error:", err.message);
  } finally {
    process.exit(0);
  }
}

test();
