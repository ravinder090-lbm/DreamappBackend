import "dotenv/config";
import { sequelize } from "./lib/db.js";
import { SubAdmin } from "./models/SubAdmin.js";
import { uploadToB2 } from "./lib/b2Storage.js";
import crypto from "crypto";

async function uploadBase64ToB2(base64Str, prefix = "image") {
  if (!base64Str.startsWith("data:")) return base64Str;
  
  const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return base64Str;
  
  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], "base64");
  const ext = mimeType.split("/")[1] || "png";
  const filename = `${prefix}_${crypto.randomBytes(8).toString("hex")}.${ext}`;
  
  const url = await uploadToB2(buffer, filename, mimeType);
  return url;
}

async function migrateSubAdminLogos() {
  try {
    await sequelize.authenticate();
    console.log("Connected to DB.");

    const subAdmins = await SubAdmin.findAll();
    let count = 0;

    for (const subAdmin of subAdmins) {
      if (subAdmin.logo && subAdmin.logo.startsWith("data:image/")) {
        console.log(`Migrating logo for SubAdmin ${subAdmin.name}...`);
        try {
          const url = await uploadBase64ToB2(subAdmin.logo, "subadmin_logos");
          subAdmin.logo = url;
          await subAdmin.save();
          console.log(`Successfully migrated logo for ${subAdmin.name} to ${url}`);
          count++;
        } catch (err) {
          console.error(`Failed to migrate logo for ${subAdmin.name}:`, err);
        }
      }
    }

    console.log(`Finished migrating ${count} SubAdmin logos.`);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

migrateSubAdminLogos();
