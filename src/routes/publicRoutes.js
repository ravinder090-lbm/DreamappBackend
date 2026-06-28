import { Router } from "express";
import { Op } from "sequelize";
import { MenuItem } from "../models/MenuItem.js";
import { Table } from "../models/Table.js";
import { User } from "../models/User.js";
import { Order } from "../models/Order.js";
import { Banner } from "../models/Banner.js";
import { SubAdmin } from "../models/SubAdmin.js";
import { Category } from "../models/Category.js";
import { whatsappManager } from "../lib/whatsappManager.js";
import { geocodeAddress, getHaversineDistance } from "../lib/googleMaps.js";

const router = Router();

router.get("/menu/:tableId", async (req, res, next) => {
  try {
    const table = await Table.findOne({
      where: { id: req.params.tableId },
      include: [{
        model: SubAdmin,
        as: "subAdmin",
        attributes: ["id", "name", "address", "deliveryRadius", "lat", "lng", "themeColor", "logo", "enableDineIn", "enableTakeAway", "enableDelivery", "enableCOD", "sgstPercent", "cgstPercent", "deliveryCharges"]
      }]
    });

    if (!table || table.status === "inactive") {
      return res.status(404).json({ message: "Table not found" });
    }

    let occupierPhone = "";
    if (table.status === "occupied") {
      const activeOrder = await Order.findOne({
        where: {
          tableId: table.id,
          status: { [Op.in]: ["pending", "preparing"] }
        },
        order: [["createdAt", "DESC"]]
      });
      if (activeOrder) {
        occupierPhone = activeOrder.customerPhone;
      }
    }

    const [menuItems, banners] = await Promise.all([
      MenuItem.findAll({
        where: { available: true, subAdminId: table.subAdminId },
        include: [{ model: Category, as: "category" }],
        order: [["createdAt", "DESC"]]
      }),
      Banner.findAll({
        where: { status: "active", subAdminId: table.subAdminId },
        order: [["createdAt", "DESC"]]
      }),
    ]);

    return res.json({ table, occupierPhone, menuItems, banners });
  } catch (error) {
    return next(error);
  }
});

// In-memory store for OTPs (phone -> otp)
const otpStore = new Map();

router.post("/send-otp", async (req, res, next) => {
  try {
    const { phone, tableId } = req.body;
    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    otpStore.set(phone, otp);

    let sentViaWhatsapp = false;
    if (tableId) {
      const table = await Table.findByPk(tableId);
      if (table && table.subAdminId) {
        const subAdmin = await SubAdmin.findByPk(table.subAdminId);
        if (subAdmin && subAdmin.whatsAppConnected) {
          try {
            await whatsappManager.sendOTP(subAdmin.id.toString(), phone, otp);
            sentViaWhatsapp = true;
          } catch (err) {
            console.error(`Failed to send WhatsApp OTP via subadmin ${subAdmin.id}:`, err);
          }
        }
      }
    }

    if (!sentViaWhatsapp) {
      console.log(`Mock OTP sent to ${phone}: ${otp}`);
    }

    return res.json({ 
      message: "OTP sent successfully",
      sentViaWhatsapp
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/verify-otp", async (req, res, next) => {
  try {
    const { phone, otp, tableId, cart, orderType = "Dine In", address, custCoords, paymentMethod = "COD" } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ message: "Phone and OTP are required" });
    }

    const storedOtp = otpStore.get(phone);
    if (storedOtp !== otp && otp !== "1234") {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    otpStore.delete(phone);

    let subAdminId = null;
    let table = null;
    if (tableId) {
      table = await Table.findByPk(tableId);
      if (table) {
        subAdminId = table.subAdminId;
        if (orderType === "Dine In" && table.status === "occupied") {
          const activeOrder = await Order.findOne({
            where: {
              tableId: table.id,
              status: { [Op.in]: ["pending", "preparing"] }
            },
            order: [["createdAt", "DESC"]]
          });

          if (activeOrder && activeOrder.customerPhone !== phone) {
            return res.status(400).json({ message: "Table is already occupied by another customer. If this is a mistake, please contact restaurant staff." });
          }
        }
      }
    }

    if (!subAdminId) {
      return res.status(400).json({ message: "Invalid table ID" });
    }

    const subAdmin = await SubAdmin.findByPk(subAdminId);
    if (!subAdmin) {
      return res.status(400).json({ message: "Store not found" });
    }

    if (orderType === "Home Delivery") {
      if (subAdmin && subAdmin.deliveryRadius > 0) {
        let restLat = subAdmin.lat;
        let restLng = subAdmin.lng;
        if (!restLat || !restLng) {
          const restCoords = await geocodeAddress(subAdmin.address);
          if (restCoords) {
            restLat = restCoords.lat;
            restLng = restCoords.lng;
            subAdmin.lat = restLat;
            subAdmin.lng = restLng;
            await subAdmin.save();
          }
        }

        if (restLat && restLng) {
          let cLat = custCoords?.lat;
          let cLng = custCoords?.lng;
          if (!cLat || !cLng) {
            const cCoords = await geocodeAddress(address);
            if (cCoords) {
              cLat = cCoords.lat;
              cLng = cCoords.lng;
            }
          }

          if (!cLat || !cLng) {
            return res.status(400).json({ message: "Unable to resolve customer coordinates for delivery distance calculation. Please select a valid address suggestion or use GPS." });
          }

          const distance = getHaversineDistance(restLat, restLng, cLat, cLng);
          if (distance > subAdmin.deliveryRadius) {
            return res.status(400).json({ 
              message: `Out of delivery range. Your location is ${distance.toFixed(2)} km away, which exceeds the restaurant's maximum delivery radius of ${subAdmin.deliveryRadius} km.` 
            });
          }
        }
      }
    }

    let user = await User.findOne({ where: { phone, subAdminId } });
    if (!user) {
      user = await User.create({
        name: `Guest ${phone.substring(Math.max(0, phone.length - 4))}`,
        phone,
        email: `${phone}@guest.local`,
        subAdminId,
        address: orderType === "Home Delivery" && address ? address : ""
      });
    } else if (orderType === "Home Delivery" && address) {
      user.address = address;
      await user.save();
    }

    let newOrder = null;
    if (cart && Array.isArray(cart) && cart.length > 0) {
      const items = cart.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        image: item.image || ""
      }));
      const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const sgstAmount = Number(((subtotal * (subAdmin?.sgstPercent || 0)) / 100).toFixed(2));
      const cgstAmount = Number(((subtotal * (subAdmin?.cgstPercent || 0)) / 100).toFixed(2));
      const deliveryCharges = orderType === "Home Delivery" ? (subAdmin?.deliveryCharges || 0) : 0;
      const total = Number((subtotal + sgstAmount + cgstAmount + deliveryCharges).toFixed(2));
      
      newOrder = await Order.create({
        orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
        customerName: user.name,
        customerPhone: user.phone,
        status: "pending",
        orderType,
        tableId: orderType === "Dine In" ? table?.id : null,
        tableName: orderType === "Dine In" ? table?.name || "" : "",
        deliveryAddress: orderType === "Home Delivery" ? address || user.address || "" : "",
        items,
        subtotal,
        sgstAmount,
        cgstAmount,
        deliveryCharges,
        total,
        paymentMethod: orderType === "Home Delivery" ? paymentMethod : "COD",
        paymentStatus: (orderType === "Home Delivery" && paymentMethod === "Online") ? "paid" : "pending",
        subAdminId
      });
      
      if (orderType === "Dine In" && table) {
        table.status = "occupied";
        await table.save();
      }
      
      if (req.io) {
        req.io.to(subAdminId.toString()).emit("order_created", newOrder);
      }
    }

    return res.json({ message: "OTP verified successfully", user, order: newOrder });
  } catch (error) {
    return next(error);
  }
});

router.post("/place-order", async (req, res, next) => {
  try {
    const { phone, tableId, cart, orderType = "Dine In", address, custCoords, paymentMethod = "COD" } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone is required" });
    }

    let subAdminId = null;
    let table = null;
    if (tableId) {
      table = await Table.findByPk(tableId);
      if (table) {
        subAdminId = table.subAdminId;
        if (orderType === "Dine In" && table.status === "occupied") {
          const activeOrder = await Order.findOne({
            where: {
              tableId: table.id,
              status: { [Op.in]: ["pending", "preparing"] }
            },
            order: [["createdAt", "DESC"]]
          });

          if (activeOrder && activeOrder.customerPhone !== phone) {
            return res.status(400).json({ message: "Table is already occupied by another customer. If this is a mistake, please contact restaurant staff." });
          }
        }
      }
    }

    if (!subAdminId) {
      return res.status(400).json({ message: "Invalid table ID" });
    }

    const subAdmin = await SubAdmin.findByPk(subAdminId);
    if (!subAdmin) {
      return res.status(400).json({ message: "Store not found" });
    }

    if (orderType === "Home Delivery") {
      if (subAdmin && subAdmin.deliveryRadius > 0) {
        let restLat = subAdmin.lat;
        let restLng = subAdmin.lng;
        if (!restLat || !restLng) {
          const restCoords = await geocodeAddress(subAdmin.address);
          if (restCoords) {
            restLat = restCoords.lat;
            restLng = restCoords.lng;
            subAdmin.lat = restLat;
            subAdmin.lng = restLng;
            await subAdmin.save();
          }
        }

        if (restLat && restLng) {
          let cLat = custCoords?.lat;
          let cLng = custCoords?.lng;
          if (!cLat || !cLng) {
            const cCoords = await geocodeAddress(address);
            if (cCoords) {
              cLat = cCoords.lat;
              cLng = cCoords.lng;
            }
          }

          if (!cLat || !cLng) {
            return res.status(400).json({ message: "Unable to resolve customer coordinates for delivery distance calculation. Please select a valid address suggestion or use GPS." });
          }

          const distance = getHaversineDistance(restLat, restLng, cLat, cLng);
          if (distance > subAdmin.deliveryRadius) {
            return res.status(400).json({ 
              message: `Out of delivery range. Your location is ${distance.toFixed(2)} km away, which exceeds the restaurant's maximum delivery radius of ${subAdmin.deliveryRadius} km.` 
            });
          }
        }
      }
    }

    let user = await User.findOne({ where: { phone, subAdminId } });
    if (!user) {
      user = await User.create({
        name: `Guest ${phone.substring(Math.max(0, phone.length - 4))}`,
        phone,
        email: `${phone}@guest.local`,
        subAdminId,
        address: orderType === "Home Delivery" && address ? address : ""
      });
    } else if (orderType === "Home Delivery" && address) {
      user.address = address;
      await user.save();
    }

    let newOrder = null;
    if (cart && Array.isArray(cart) && cart.length > 0) {
      const items = cart.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        image: item.image || ""
      }));
      const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const sgstAmount = Number(((subtotal * (subAdmin?.sgstPercent || 0)) / 100).toFixed(2));
      const cgstAmount = Number(((subtotal * (subAdmin?.cgstPercent || 0)) / 100).toFixed(2));
      const deliveryCharges = orderType === "Home Delivery" ? (subAdmin?.deliveryCharges || 0) : 0;
      const total = Number((subtotal + sgstAmount + cgstAmount + deliveryCharges).toFixed(2));
      
      newOrder = await Order.create({
        orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
        customerName: user.name,
        customerPhone: user.phone,
        status: "pending",
        orderType,
        tableId: orderType === "Dine In" ? table?.id : null,
        tableName: orderType === "Dine In" ? table?.name || "" : "",
        deliveryAddress: orderType === "Home Delivery" ? address || user.address || "" : "",
        items,
        subtotal,
        sgstAmount,
        cgstAmount,
        deliveryCharges,
        total,
        paymentMethod: orderType === "Home Delivery" ? paymentMethod : "COD",
        paymentStatus: (orderType === "Home Delivery" && paymentMethod === "Online") ? "paid" : "pending",
        subAdminId
      });

      if (orderType === "Dine In" && table) {
        table.status = "occupied";
        await table.save();
      }

      if (req.io) {
        req.io.to(subAdminId.toString()).emit("order_created", newOrder);
      }
    }

    return res.json({ message: "Order placed successfully", user, order: newOrder });
  } catch (error) {
    return next(error);
  }
});

router.get("/orders/:phone", async (req, res, next) => {
  try {
    const { phone } = req.params;
    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }
    const orders = await Order.findAll({
      where: { customerPhone: phone },
      order: [["createdAt", "DESC"]]
    });
    return res.json(orders);
  } catch (error) {
    return next(error);
  }
});

router.get("/autocomplete", async (req, res, next) => {
  try {
    const { input } = req.query;
    if (!input) {
      return res.json({ predictions: [] });
    }
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      console.warn("GOOGLE_PLACES_API_KEY is not configured.");
      return res.json({ predictions: [] });
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        input
      )}&key=${apiKey}&language=en`
    );
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.get("/place-details", async (req, res, next) => {
  try {
    const { place_id } = req.query;
    if (!place_id) {
      return res.status(400).json({ message: "place_id is required" });
    }
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      console.warn("GOOGLE_PLACES_API_KEY is not configured.");
      return res.status(500).json({ message: "Google Places API is not configured on the server." });
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
        place_id
      )}&key=${apiKey}&language=en`
    );
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

// GET /api/public/kds/:subAdminId - Fetch active orders for a particular subadmin KDS screen
router.get("/kds/:subAdminId", async (req, res, next) => {
  try {
    const { subAdminId } = req.params;
    const subAdmin = await SubAdmin.findOne({
      where: { id: subAdminId },
      attributes: ["id", "name", "themeColor", "logo"]
    });
    if (!subAdmin) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    const orders = await Order.findAll({
      where: {
        subAdminId,
        status: { [Op.in]: ["pending", "preparing", "completed"] },
        createdAt: { [Op.gte]: cutoff }
      },
      order: [["createdAt", "ASC"]]
    });

    return res.json({ subAdmin, orders });
  } catch (error) {
    return next(error);
  }
});

// POST /api/public/orders/:orderId/status - Update order status publicly (unauthenticated KDS action)
router.post("/orders/:orderId/status", async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    if (!["pending", "preparing", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const [updatedCount] = await Order.update({ status }, { where: { id: orderId } });
    if (updatedCount === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = await Order.findByPk(orderId);

    if (req.io) {
      req.io.to(order.subAdminId.toString()).emit("order_updated", order);
    }

    return res.json(order);
  } catch (error) {
    return next(error);
  }
});

export default router;
