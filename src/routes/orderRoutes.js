import { Router } from "express";
import { Op } from "sequelize";
import { requireAuth } from "../middleware/auth.js";
import { Order } from "../models/Order.js";
import { Table } from "../models/Table.js";
import { DeliveryAgent } from "../models/DeliveryAgent.js";
import { SubAdmin } from "../models/SubAdmin.js";
import { whatsappManager } from "../lib/whatsappManager.js";
import { getClientUrl } from "./publicRoutes.js";

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

// Helper to auto-release table if no active orders remain
async function releaseTableIfIdle(tableId, subAdminId, currentOrderId) {
  if (!tableId) return;
  try {
    const remainingCount = await Order.count({
      where: {
        tableId,
        subAdminId,
        status: { [Op.in]: ["pending", "preparing"] },
        ...(currentOrderId ? { id: { [Op.ne]: currentOrderId } } : {})
      }
    });

    if (remainingCount === 0) {
      await Table.update(
        { status: "available" },
        { where: { id: tableId, subAdminId } }
      );
    }
  } catch (err) {
    console.error("Failed to auto-release table:", err);
  }
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
        { model: Table, as: "table", attributes: ["name", "code", "tableType"] },
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

    // If order is Dine-In with tableId, mark table occupied
    if (order.tableId && order.orderType === "Dine In") {
      await Table.update(
        { status: "occupied" },
        { where: { id: order.tableId, subAdminId: req.user.id } }
      ).catch(() => {});
    }

    const populated = await Order.findOne({
      where: { id: order.id },
      include: [
        { model: Table, as: "table", attributes: ["name", "code"] },
        { model: DeliveryAgent, as: "deliveryAgent", attributes: ["id", "name", "phone", "status", "vehicleDetails"] }
      ]
    });

    invalidateOrdersCache(req.user.id);

    if (req.io) {
      const room = req.user.id.toString();
      const count = req.io.sockets?.adapter?.rooms?.get(room)?.size || 0;
      console.log(`[Socket.io] Emitting order_created to room "${room}" (active listeners: ${count})`);
      req.io.to(room).emit("order_created", populated);
      if (order.tableId) {
        req.io.to(room).emit("catalog_updated");
      }
    }

    if (populated.customerPhone) {
      const subAdmin = await SubAdmin.findByPk(req.user.id);
      if (subAdmin && subAdmin.whatsAppConnected) {
        const clientUrl = getClientUrl(req);
        const receiptUrl = `${clientUrl}/receipt/${populated.orderNumber || populated.id}`;
        whatsappManager.sendOrderInvoice(req.user.id.toString(), populated.customerPhone, populated, subAdmin.name || "Store", receiptUrl).catch(err => console.error(err));
      }
    }

    res.status(201).json(populated);
  } catch (error) {
    next(error);
  }
});

const handleUpdateOrder = async (req, res, next) => {
  try {
    if (req.body.table) {
      req.body.tableId = req.body.table;
    }
    if (req.body.items) {
      req.body.items = sanitizeOrderItems(req.body.items);
    }

    // Protect against overwriting subAdminId or primary id
    delete req.body.subAdminId;
    delete req.body.id;

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

    // Auto-release table if completed, delivered, or cancelled
    if (order.tableId && ["completed", "delivered", "cancelled"].includes(order.status)) {
      await releaseTableIfIdle(order.tableId, req.user.id, order.id);
    }

    invalidateOrdersCache(req.user.id);

    if (req.io) {
      req.io.to(req.user.id.toString()).emit("order_updated", order);
      if (order.tableId && ["completed", "delivered", "cancelled"].includes(order.status)) {
        req.io.to(req.user.id.toString()).emit("catalog_updated");
      }
      if (order.deliveryAgentId) {
        req.io.to(order.deliveryAgentId.toString()).emit("order_updated", order);
      }
    }

    return res.json(order);
  } catch (error) {
    console.error(error);
    return next(error);
  }
};

router.post("/:id", handleUpdateOrder);
router.patch("/:id", handleUpdateOrder);
router.put("/:id", handleUpdateOrder);

router.delete("/:id", async (req, res, next) => {
  try {
    const order = await Order.findOne({ where: { id: req.params.id, subAdminId: req.user.id } });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const tableId = order.tableId;
    await Order.destroy({ where: { id: req.params.id, subAdminId: req.user.id } });

    if (tableId) {
      await releaseTableIfIdle(tableId, req.user.id, null);
    }

    invalidateOrdersCache(req.user.id);

    if (req.io) {
      req.io.to(req.user.id.toString()).emit("order_deleted", { orderId: req.params.id });
      if (tableId) {
        req.io.to(req.user.id.toString()).emit("catalog_updated");
      }
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
