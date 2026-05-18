import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { Order } from "../models/Order.js";

const router = Router();

router.use(requireAuth(["subadmin"]));

router.get("/", async (req, res, next) => {
  try {
    const orders = await Order.find({ subAdmin: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, subAdmin: req.user.id });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json(order);
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const order = await Order.create({ ...req.body, subAdmin: req.user.id });
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

router.post("/:id", async (req, res, next) => {
  try {

    console.log("PATCH order", req.params.id, req.body);
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, subAdmin: req.user.id },
      { $set: req.body },
      {
        new: true,
        runValidators: false,
      }
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json(order);
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

export default router;
