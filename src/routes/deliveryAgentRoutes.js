import { Router } from "express";
import { Op } from "sequelize";
import { requireAuth } from "../middleware/auth.js";
import { DeliveryAgent } from "../models/DeliveryAgent.js";
import { Order } from "../models/Order.js";

const router = Router();

// -----------------------------------------------------
// DELIVERY AGENT OWN ROUTES (Logged in as agent)
// -----------------------------------------------------

// Get assigned orders for logged-in delivery agent
router.get("/my-orders", requireAuth(["delivery_agent"]), async (req, res, next) => {
  try {
    const orders = await Order.findAll({
      where: {
        deliveryAgentId: req.user.id,
        status: {
          [Op.in]: ["preparing", "ready", "out_for_delivery"]
        }
      },
      order: [["createdAt", "DESC"]]
    });
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

// Update order status (e.g. out_for_delivery, delivered)
router.patch("/my-orders/:orderId/status", requireAuth(["delivery_agent"]), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["out_for_delivery", "delivered"].includes(status)) {
      return res.status(400).json({ message: "Invalid status update" });
    }

    const order = await Order.findOne({
      where: { id: req.params.orderId, deliveryAgentId: req.user.id }
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.status = status;
    await order.save();

    if (req.io) {
      req.io.to(order.subAdminId.toString()).emit("order_updated", order);
    }

    res.json(order);
  } catch (error) {
    next(error);
  }
});

// Update agent's own status (available / offline / on-delivery)
router.patch("/my-status", requireAuth(["delivery_agent"]), async (req, res, next) => {
  try {
    const { status } = req.body;
    const agent = await DeliveryAgent.findByPk(req.user.id);
    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }
    agent.status = status;
    await agent.save();
    res.json(agent);
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------
// SUBADMIN ROUTES FOR MANAGING AGENTS
// -----------------------------------------------------
router.use(requireAuth(["subadmin"]));

router.get("/", async (req, res, next) => {
  try {
    const agents = await DeliveryAgent.findAll({
      where: { subAdminId: req.user.id },
      order: [["createdAt", "DESC"]]
    });
    res.json(agents);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const agentData = { ...req.body, subAdminId: req.user.id };
    
    // check if phone exists for this subadmin
    const existing = await DeliveryAgent.findOne({
      where: { phone: agentData.phone, subAdminId: req.user.id }
    });
    if (existing) {
      return res.status(400).json({ message: "Agent with this phone number already exists" });
    }

    const agent = await DeliveryAgent.create(agentData);
    res.status(201).json(agent);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const agent = await DeliveryAgent.findOne({
      where: { id: req.params.id, subAdminId: req.user.id }
    });
    if (!agent) {
      return res.status(404).json({ message: "Delivery agent not found" });
    }

    if (req.body.phone && req.body.phone !== agent.phone) {
      const existing = await DeliveryAgent.findOne({
        where: { phone: req.body.phone, subAdminId: req.user.id }
      });
      if (existing) {
        return res.status(400).json({ message: "Agent with this phone number already exists" });
      }
    }

    await agent.update(req.body);
    res.json(agent);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const agent = await DeliveryAgent.findOne({
      where: { id: req.params.id, subAdminId: req.user.id }
    });
    if (!agent) {
      return res.status(404).json({ message: "Delivery agent not found" });
    }
    await agent.destroy();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Agent updates location
router.patch("/my-location", requireAuth(["delivery_agent"]), async (req, res, next) => {
  try {
    if (req.user.role !== "delivery_agent") {
      return res.status(403).json({ message: "Only agents can update their location" });
    }
    
    const { lat, lng } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ message: "Invalid coordinates" });
    }

    const agent = await DeliveryAgent.findByPk(req.user.id);
    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    await agent.update({ lastLat: lat, lastLng: lng });

    if (req.io) {
      req.io.to(agent.subAdminId.toString()).emit("rider_moved", {
        agentId: agent.id,
        lat,
        lng,
        name: agent.name
      });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
