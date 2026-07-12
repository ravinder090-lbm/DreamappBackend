import { Router } from "express";
import { Op } from "sequelize";
import { requireAuth } from "../middleware/auth.js";
import { Table } from "../models/Table.js";
import { SubAdmin } from "../models/SubAdmin.js";

const router = Router();

router.use(requireAuth(["subadmin"]));

router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 0;
    const search = req.query.search || "";

    const options = {
      where: { subAdminId: req.user.id },
      order: [["createdAt", "DESC"]]
    };

    if (search) {
      options.where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { code: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (limit > 0) {
      options.limit = limit;
      options.offset = (page - 1) * limit;
    }

    const tables = await Table.findAll(options);
    res.json(tables);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const table = await Table.findOne({ where: { id: req.params.id, subAdminId: req.user.id } });

    if (!table) {
      return res.status(404).json({ message: "Table not found" });
    }

    return res.json(table);
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const subAdmin = await SubAdmin.findByPk(req.user.id, { include: ["subscriptionPlan"] });
    let limit = 2; // Default free tier limit
    if (subAdmin && subAdmin.subscriptionPlan && subAdmin.subscriptionPlan.tableLimit !== null) {
      limit = subAdmin.subscriptionPlan.tableLimit;
    }

    if (limit !== null) {
      const tableCount = await Table.count({ where: { subAdminId: req.user.id } });
      if (tableCount >= limit) {
        return res.status(403).json({ message: "Table limit reached. Please purchase a plan to add more tables." });
      }
    }

    const table = await Table.create({ ...req.body, subAdminId: req.user.id });
    res.status(201).json(table);
  } catch (error) {
    next(error);
  }
});

router.post("/:id", async (req, res, next) => {
  try {
    const [updatedCount] = await Table.update(req.body, {
      where: { id: req.params.id, subAdminId: req.user.id }
    });

    if (updatedCount === 0) {
      return res.status(404).json({ message: "Table not found" });
    }

    const table = await Table.findOne({ where: { id: req.params.id, subAdminId: req.user.id } });
    return res.json(table);
  } catch (error) {
    return next(error);
  }
});

export default router;
