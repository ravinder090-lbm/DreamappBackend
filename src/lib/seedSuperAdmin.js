import { SuperAdmin } from "../models/SuperAdmin.js";

export async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME || "Super Admin";

  if (!email || !password) {
    console.warn("Super admin seed skipped. Add SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD.");
    return;
  }

  const existingSuperAdmin = await SuperAdmin.findOne({ email });

  if (existingSuperAdmin) {
    return;
  }

  await SuperAdmin.create({ name, email, password });
  console.log(`Super admin created: ${email}`);
}
