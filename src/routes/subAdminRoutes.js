import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { SubAdmin } from "../models/SubAdmin.js";

const router = Router();

router.use(requireAuth(["superadmin"]));

router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 0;

    let query = SubAdmin.find().sort({ createdAt: -1 });

    if (limit > 0) {
      query = query.skip((page - 1) * limit).limit(limit);
    }

    const subAdmins = await query;
    res.json(subAdmins);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const subAdmin = await SubAdmin.create(req.body);
    res.status(201).json(subAdmin);
  } catch (error) {
    next(error);
  }
});

router.post("/:id", async (req, res, next) => {
  try {
    const subAdmin = await SubAdmin.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!subAdmin) {
      return res.status(404).json({ message: "Subadmin not found" });
    }

    return res.json(subAdmin);
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const subAdmin = await SubAdmin.findByIdAndDelete(req.params.id);

    if (!subAdmin) {
      return res.status(404).json({ message: "Subadmin not found" });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
