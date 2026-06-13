import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { Order } from "../models/Order.js";

const router = Router();

router.use(requireAuth(["subadmin"]));

router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 0;

    let query = Order.find({ subAdmin: req.user.id })
      .populate("table", "name code")
      .sort({ createdAt: -1 });

    if (limit > 0) {
      query = query.skip((page - 1) * limit).limit(limit);
    }

    const orders = await query;
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, subAdmin: req.user.id })
      .populate("table", "name code");

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
    await order.populate("table", "name code");
    if (req.io) {
      req.io.to(req.user.id.toString()).emit("order_created", order);
    }
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
    ).populate("table", "name code");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (req.io) {
      req.io.to(req.user.id.toString()).emit("order_updated", order);
    }

    return res.json(order);
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const order = await Order.findOneAndDelete({ _id: req.params.id, subAdmin: req.user.id });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (req.io) {
      req.io.to(req.user.id.toString()).emit("order_deleted", { orderId: req.params.id });
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
