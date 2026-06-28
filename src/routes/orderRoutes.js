import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { Order } from "../models/Order.js";
import { Table } from "../models/Table.js";

const router = Router();

router.use(requireAuth(["subadmin"]));

router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 0;

    const options = {
      where: { subAdminId: req.user.id },
      include: [{ model: Table, as: "table", attributes: ["name", "code"] }],
      order: [["createdAt", "DESC"]]
    };

    if (limit > 0) {
      options.limit = limit;
      options.offset = (page - 1) * limit;
    }

    const orders = await Order.findAll(options);
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const order = await Order.findOne({
      where: { id: req.params.id, subAdminId: req.user.id },
      include: [{ model: Table, as: "table", attributes: ["name", "code"] }]
    });

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
    if (req.body.table) {
      req.body.tableId = req.body.table;
    }
    const orderData = { ...req.body, subAdminId: req.user.id };
    if (!orderData.orderNumber) {
      orderData.orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    }
    const order = await Order.create(orderData);
    const populated = await Order.findOne({
      where: { id: order.id },
      include: [{ model: Table, as: "table", attributes: ["name", "code"] }]
    });
    if (req.io) {
      req.io.to(req.user.id.toString()).emit("order_created", populated);
    }
    res.status(201).json(populated);
  } catch (error) {
    next(error);
  }
});

router.post("/:id", async (req, res, next) => {
  try {
    if (req.body.table) {
      req.body.tableId = req.body.table;
    }
    console.log("PATCH order", req.params.id, req.body);
    const [updatedCount] = await Order.update(req.body, {
      where: { id: req.params.id, subAdminId: req.user.id }
    });

    if (updatedCount === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = await Order.findOne({
      where: { id: req.params.id, subAdminId: req.user.id },
      include: [{ model: Table, as: "table", attributes: ["name", "code"] }]
    });

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
    const order = await Order.findOne({ where: { id: req.params.id, subAdminId: req.user.id } });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    await Order.destroy({ where: { id: req.params.id, subAdminId: req.user.id } });
    if (req.io) {
      req.io.to(req.user.id.toString()).emit("order_deleted", { orderId: req.params.id });
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
