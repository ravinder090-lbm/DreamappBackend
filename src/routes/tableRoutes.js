import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { Table } from "../models/Table.js";

const router = Router();

router.use(requireAuth(["subadmin"]));

router.get("/", async (req, res, next) => {
  try {
    const tables = await Table.find({ subAdmin: req.user.id }).sort({ createdAt: -1 });
    res.json(tables);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const table = await Table.findOne({ _id: req.params.id, subAdmin: req.user.id });

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
    const table = await Table.create({ ...req.body, subAdmin: req.user.id });
    res.status(201).json(table);
  } catch (error) {
    next(error);
  }
});

router.post("/:id", async (req, res, next) => {
  try {
    const table = await Table.findOneAndUpdate(
      { _id: req.params.id, subAdmin: req.user.id },
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!table) {
      return res.status(404).json({ message: "Table not found" });
    }

    return res.json(table);
  } catch (error) {
    return next(error);
  }
});

export default router;
