import "dotenv/config";
import { sequelize } from "./lib/db.js";
import { MenuItem } from "./models/MenuItem.js";
import { Category } from "./models/Category.js";
import { Banner } from "./models/Banner.js";
import { Order } from "./models/Order.js";
import { uploadToB2 } from "./lib/b2Storage.js";
import crypto from "crypto";

async function uploadBase64ToB2(base64Str) {
  if (!base64Str || typeof base64Str !== "string" || !base64Str.startsWith("data:image")) {
    return base64Str;
  }
  try {
    const matches = base64Str.match(/^data:(image\/[a-zA-Z0-9+\-+.]+);base64,(.+)$/);
    if (!matches) return "";
    const mimetype = matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    const ext = mimetype.split("/")[1] || "png";
    const filename = `migrated_${crypto.randomBytes(8).toString("hex")}.${ext}`;

    const url = await uploadToB2(buffer, filename, mimetype);
    console.log(`Successfully migrated base64 (${(buffer.length/1024).toFixed(1)} KB) -> ${url}`);
    return url;
  } catch (err) {
    console.error("Failed to upload base64 to B2:", err.message);
    // Return empty string or dummy placeholder instead of keeping 1MB base64
    return "";
  }
}

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log("DB Connected for migration.");

    // 1. Migrate MenuItems
    const menuItems = await MenuItem.findAll();
    console.log(`Checking ${menuItems.length} MenuItems...`);
    for (const item of menuItems) {
      if (item.image && item.image.startsWith("data:image")) {
        console.log(`Migrating MenuItem ID ${item.id} (${item.name})...`);
        const newUrl = await uploadBase64ToB2(item.image);
        item.image = newUrl;
        await item.save();
      }
    }

    // 2. Migrate Categories
    const categories = await Category.findAll();
    console.log(`Checking ${categories.length} Categories...`);
    for (const cat of categories) {
      if (cat.image && cat.image.startsWith("data:image")) {
        console.log(`Migrating Category ID ${cat.id} (${cat.name})...`);
        const newUrl = await uploadBase64ToB2(cat.image);
        cat.image = newUrl;
        await cat.save();
      }
    }

    // 3. Migrate Banners
    const banners = await Banner.findAll();
    console.log(`Checking ${banners.length} Banners...`);
    for (const ban of banners) {
      if (ban.image && ban.image.startsWith("data:image")) {
        console.log(`Migrating Banner ID ${ban.id}...`);
        const newUrl = await uploadBase64ToB2(ban.image);
        ban.image = newUrl;
        await ban.save();
      }
    }

    // 4. Sanitize Orders items JSON
    const orders = await Order.findAll();
    console.log(`Checking ${orders.length} Orders...`);
    for (const order of orders) {
      if (order.items && Array.isArray(order.items)) {
        let modified = false;
        const cleanedItems = order.items.map(item => {
          if (item.image && typeof item.image === "string" && item.image.startsWith("data:image")) {
            modified = true;
            return { ...item, image: "" }; // Strip 1MB base64 string from order item snapshot
          }
          return item;
        });

        if (modified) {
          console.log(`Cleaning order ID ${order.id} (${order.orderNumber})...`);
          order.items = cleanedItems;
          order.changed("items", true);
          await order.save();
        }
      }
    }

    console.log("Migration finished successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  }
}

migrate();
