import "dotenv/config";
import { sequelize } from "./lib/db.js";
import { SubAdmin } from "./models/SubAdmin.js";
import { Table } from "./models/Table.js";
import { Category } from "./models/Category.js";
import { MenuItem } from "./models/MenuItem.js";
import { Op } from "sequelize";

async function findBase64() {
  await sequelize.authenticate();
  const subAdminId = (await SubAdmin.findOne()).id;
  
  const subAdmin = await SubAdmin.findOne({ where: { id: subAdminId }});
  if (subAdmin.logo && subAdmin.logo.includes("base64")) console.log("SubAdmin logo size:", subAdmin.logo.length);
  
  const menuItems = await MenuItem.findAll({ where: { subAdminId } });
  menuItems.forEach(item => {
    if (item.image && item.image.includes("base64")) {
      console.log(`MenuItem ${item.name} image size:`, item.image.length);
    }
  });

  const categories = await Category.findAll({ where: { subAdminId } });
  categories.forEach(item => {
    if (item.image && item.image.includes("base64")) {
      console.log(`Category ${item.name} image size:`, item.image.length);
    }
  });

  process.exit(0);
}
findBase64();
