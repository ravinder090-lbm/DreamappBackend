import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";

const router = Router();

// Everyone can view plans
router.get("/", requireAuth(["superadmin", "subadmin"]), async (req, res, next) => {
  try {
    const plans = await SubscriptionPlan.findAll({
      order: [["price", "ASC"]]
    });
    res.json(plans);
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth(["superadmin"]), async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.create(req.body);
    res.status(201).json(plan);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requireAuth(["superadmin"]), async (req, res, next) => {
  try {
    const [updatedCount] = await SubscriptionPlan.update(req.body, {
      where: { id: req.params.id }
    });

    if (updatedCount === 0) {
      return res.status(404).json({ message: "Subscription plan not found" });
    }

    const plan = await SubscriptionPlan.findByPk(req.params.id);
    return res.json(plan);
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requireAuth(["superadmin"]), async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findByPk(req.params.id);

    if (!plan) {
      return res.status(404).json({ message: "Subscription plan not found" });
    }

    await SubscriptionPlan.destroy({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
