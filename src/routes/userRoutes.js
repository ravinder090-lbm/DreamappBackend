import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";

const router = Router();

router.use(requireAuth(["subadmin"]));

router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 0;

    const options = {
      where: { subAdminId: req.user.id },
      order: [["createdAt", "DESC"]]
    };

    if (limit > 0) {
      options.limit = limit;
      options.offset = (page - 1) * limit;
    }

    const users = await User.findAll(options);
    res.json(users);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, subAdminId: req.user.id } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(user);
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const user = await User.create({ ...req.body, subAdminId: req.user.id });
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

router.post("/:id", async (req, res, next) => {
  try {
    const [updatedCount] = await User.update(req.body, {
      where: { id: req.params.id, subAdminId: req.user.id }
    });

    if (updatedCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = await User.findOne({ where: { id: req.params.id, subAdminId: req.user.id } });
    return res.json(user);
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, subAdminId: req.user.id } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    await User.destroy({ where: { id: req.params.id, subAdminId: req.user.id } });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
