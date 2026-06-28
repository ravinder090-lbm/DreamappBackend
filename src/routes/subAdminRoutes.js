import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { SubAdmin } from "../models/SubAdmin.js";

const router = Router();

router.use(requireAuth(["superadmin"]));

router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 0;

    const options = {
      order: [["createdAt", "DESC"]]
    };

    if (limit > 0) {
      options.limit = limit;
      options.offset = (page - 1) * limit;
    }

    const subAdmins = await SubAdmin.findAll(options);
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
    const [updatedCount] = await SubAdmin.update(req.body, {
      where: { id: req.params.id }
    });

    if (updatedCount === 0) {
      return res.status(404).json({ message: "Subadmin not found" });
    }

    const subAdmin = await SubAdmin.findByPk(req.params.id);
    return res.json(subAdmin);
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const subAdmin = await SubAdmin.findByPk(req.params.id);

    if (!subAdmin) {
      return res.status(404).json({ message: "Subadmin not found" });
    }

    await SubAdmin.destroy({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
