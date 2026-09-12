import { Sequelize } from "sequelize";

const poolerUrl = "postgresql://neondb_owner:npg_gTEzP6Dm2Ulk@ep-green-smoke-ad6bm6il-pooler.c-2.us-east-1.aws.neon.tech/dreamapp?sslmode=require";
const directUrl = "postgresql://neondb_owner:npg_gTEzP6Dm2Ulk@ep-green-smoke-ad6bm6il.c-2.us-east-1.aws.neon.tech/dreamapp?sslmode=require";

async function test(name, url) {
  console.log(`Testing ${name}...`);
  const s = new Sequelize(url, {
    dialect: "postgres",
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
  });

  const t0 = Date.now();
  await s.authenticate();
  console.log(`${name} Auth time:`, Date.now() - t0, "ms");

  const t1 = Date.now();
  const [res] = await s.query("SELECT id, name, logo FROM \"SubAdmins\" WHERE id = '8620288c-b6cd-4249-aafe-5c8abd181851';");
  console.log(`${name} Query time:`, Date.now() - t1, "ms", "Logo len:", res[0]?.logo?.length);
  await s.close();
}

async function run() {
  await test("Pooler URL", poolerUrl);
  await test("Direct URL", directUrl);
}

run();
