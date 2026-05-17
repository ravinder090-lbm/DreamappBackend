import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import { Table } from "../models/Table.js";
import { Category } from "../models/Category.js";
import { MenuItem } from "../models/MenuItem.js";

const router = Router();

router.use(requireAuth(["subadmin"]));

router.get("/", async (req, res, next) => {
  try {
    const [orders, users, tables, categories, menuItems] = await Promise.all([
      Order.countDocuments({ subAdmin: req.user.id }),
      User.countDocuments({ subAdmin: req.user.id }),
      Table.countDocuments({ subAdmin: req.user.id }),
      Category.countDocuments({ subAdmin: req.user.id }),
      MenuItem.countDocuments({ subAdmin: req.user.id }),
    ]);

    res.json({
      orders,
      users,
      tables,
      categories,
      menuItems
    });
  } catch (error) {
    next(error);
  }
});

export default router;
