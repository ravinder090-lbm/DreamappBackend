import { Router } from "express";
import { MenuItem } from "../models/MenuItem.js";
import { Table } from "../models/Table.js";

const router = Router();

router.get("/menu/:tableId", async (req, res, next) => {
  try {
    const table = await Table.findById(req.params.tableId);

    if (!table || table.status === "inactive") {
      return res.status(404).json({ message: "Table not found" });
    }

    const menuItems = await MenuItem.find({ available: true, subAdmin: table.subAdmin })
      .populate("category")
      .sort({ createdAt: -1 });

    return res.json({ table, menuItems });
  } catch (error) {
    return next(error);
  }
});

export default router;
