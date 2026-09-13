import { Router } from "express";
import { Op } from "sequelize";
import { requireAuth } from "../middleware/auth.js";
import { Order } from "../models/Order.js";
import { Table } from "../models/Table.js";
import { DeliveryAgent } from "../models/DeliveryAgent.js";
import { SubAdmin } from "../models/SubAdmin.js";
import { whatsappManager } from "../lib/whatsappManager.js";

const router = Router();

const ordersCache = new Map();

export function invalidateOrdersCache(subAdminId) {
  if (subAdminId) {
    ordersCache.delete(subAdminId.toString());
  }
}

export function sanitizeOrderItems(items) {
  if (!Array.isArray(items)) return items;
  return items.map(item => {
    if (item && item.image && typeof item.image === "string" && item.image.startsWith("data:image")) {
      return { ...item, image: "" };
    }
    return item;
  });
}

router.use(requireAuth(["subadmin"]));

router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search || "";
    const cacheKey = req.user.id.toString();

    // Fast Cache Hit for default listing (Page 1 with no search filter)
    if (page === 1 && !search) {
      const cached = ordersCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < 15000)) {
        res.setHeader("X-Cache", "HIT");
        return res.json(cached.data);
      }
    }

    const options = {
      where: { subAdminId: req.user.id },
      include: [
        { model: Table, as: "table", attributes: ["name", "code"] },
        { model: DeliveryAgent, as: "deliveryAgent", attributes: ["id", "name", "phone", "status", "vehicleDetails"] }
      ],
      order: [["createdAt", "DESC"]],
      subQuery: false
    };

    if (search) {
      options.where[Op.or] = [
        { orderNumber: { [Op.iLike]: `%${search}%` } },
        { customerName: { [Op.iLike]: `%${search}%` } },
        { customerPhone: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (limit > 0) {
      options.limit = limit;
      options.offset = (page - 1) * limit;
    }

    const orders = await Order.findAll(options);

    // Save to cache for default listing
    if (page === 1 && !search) {
      ordersCache.set(cacheKey, { timestamp: Date.now(), data: orders });
      res.setHeader("X-Cache", "MISS");
    }

    res.json(orders);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const order = await Order.findOne({
      where: { id: req.params.id, subAdminId: req.user.id },
      include: [
        { model: Table, as: "table", attributes: ["name", "code"] },
        { model: DeliveryAgent, as: "deliveryAgent", attributes: ["id", "name", "phone", "status", "vehicleDetails"] }
      ]
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
    if (req.body.address && !req.body.deliveryAddress) {
      req.body.deliveryAddress = req.body.address;
    }
    const orderData = { ...req.body, subAdminId: req.user.id };
    if (orderData.items) {
      orderData.items = sanitizeOrderItems(orderData.items);
    }
    if (!orderData.orderNumber) {
      orderData.orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    }
    if (!orderData.customerName || !orderData.customerName.trim()) {
      orderData.customerName = "Walk-in Guest";
    }
    if (!orderData.customerPhone) {
      orderData.customerPhone = "";
    }
    if (!orderData.status || orderData.status === "pending") {
      orderData.status = "preparing";
    }
    const order = await Order.create(orderData);
    const populated = await Order.findOne({
      where: { id: order.id },
      include: [
        { model: Table, as: "table", attributes: ["name", "code"] },
        { model: DeliveryAgent, as: "deliveryAgent", attributes: ["id", "name", "phone", "status", "vehicleDetails"] }
      ]
    });
    invalidateOrdersCache(req.user.id);
    if (req.io) {
      req.io.to(req.user.id.toString()).emit("order_created", populated);
    }
    if (populated.customerPhone) {
      const subAdmin = await SubAdmin.findByPk(req.user.id);
      if (subAdmin && subAdmin.whatsAppConnected) {
        whatsappManager.sendOrderInvoice(req.user.id.toString(), populated.customerPhone, populated, subAdmin.name || "Store").catch(err => console.error(err));
      }
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
      include: [
        { model: Table, as: "table", attributes: ["name", "code"] },
        { model: DeliveryAgent, as: "deliveryAgent", attributes: ["id", "name", "phone", "status", "vehicleDetails"] }
      ]
    });

    invalidateOrdersCache(req.user.id);
    if (req.io) {
      req.io.to(req.user.id.toString()).emit("order_updated", order);
      if (order.deliveryAgentId) {
        req.io.to(order.deliveryAgentId.toString()).emit("order_updated", order);
      }
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
    invalidateOrdersCache(req.user.id);
    if (req.io) {
      req.io.to(req.user.id.toString()).emit("order_deleted", { orderId: req.params.id });
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
