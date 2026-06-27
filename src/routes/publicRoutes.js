import { Router } from "express";
import { MenuItem } from "../models/MenuItem.js";
import { Table } from "../models/Table.js";
import { User } from "../models/User.js";
import { Order } from "../models/Order.js";
import { Banner } from "../models/Banner.js";
import { SubAdmin } from "../models/SubAdmin.js";
import { whatsappManager } from "../lib/whatsappManager.js";
import { geocodeAddress, getHaversineDistance } from "../lib/googleMaps.js";

const router = Router();

router.get("/menu/:tableId", async (req, res, next) => {
  try {
    const table = await Table.findById(req.params.tableId).populate("subAdmin", "name address deliveryRadius lat lng themeColor logo enableDineIn enableTakeAway enableDelivery enableCOD sgstPercent cgstPercent deliveryCharges");

    if (!table || table.status === "inactive") {
      return res.status(404).json({ message: "Table not found" });
    }

    let occupierPhone = "";
    if (table.status === "occupied") {
      const activeOrder = await Order.findOne({
        table: table._id,
        status: { $in: ["pending", "preparing"] }
      }).sort({ createdAt: -1 });
      if (activeOrder) {
        occupierPhone = activeOrder.customerPhone;
      }
    }

    const [menuItems, banners] = await Promise.all([
      MenuItem.find({ available: true, subAdmin: table.subAdmin })
        .populate("category")
        .sort({ createdAt: -1 }),
      Banner.find({ status: "active", subAdmin: table.subAdmin })
        .sort({ createdAt: -1 }),
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

    // Generate a 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    otpStore.set(phone, otp);

    let sentViaWhatsapp = false;
    if (tableId) {
      const table = await Table.findById(tableId);
      if (table && table.subAdmin) {
        const subAdmin = await SubAdmin.findById(table.subAdmin);
        if (subAdmin && subAdmin.whatsAppConnected) {
          try {
            await whatsappManager.sendOTP(subAdmin._id.toString(), phone, otp);
            sentViaWhatsapp = true;
          } catch (err) {
            console.error(`Failed to send WhatsApp OTP via subadmin ${subAdmin._id}:`, err);
          }
        }
      }
    }

    if (!sentViaWhatsapp) {
      // Mock sending OTP (e.g. log it for development)
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
    // Allow '1234' as a universal test OTP as well
    if (storedOtp !== otp && otp !== "1234") {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // OTP is valid, clear it
    otpStore.delete(phone);

    let subAdminId = null;
    let table = null;
    if (tableId) {
      table = await Table.findById(tableId);
      if (table) {
        subAdminId = table.subAdmin;
        if (orderType === "Dine In" && table.status === "occupied") {
          const activeOrder = await Order.findOne({
            table: table._id,
            status: { $in: ["pending", "preparing"] }
          }).sort({ createdAt: -1 });

          if (activeOrder && activeOrder.customerPhone !== phone) {
            return res.status(400).json({ message: "Table is already occupied by another customer. If this is a mistake, please contact restaurant staff." });
          }
        }
      }
    }

    if (!subAdminId) {
      return res.status(400).json({ message: "Invalid table ID" });
    }

    if (orderType === "Home Delivery") {
      const subAdmin = await SubAdmin.findById(subAdminId);
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

    // Find or create user
    let user = await User.findOne({ phone, subAdmin: subAdminId });
    if (!user) {
      user = await User.create({
        name: `Guest ${phone.substring(Math.max(0, phone.length - 4))}`,
        phone,
        email: `${phone}@guest.local`,
        subAdmin: subAdminId,
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
        table: orderType === "Dine In" ? table?._id : null,
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
        subAdmin: subAdminId
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
      table = await Table.findById(tableId);
      if (table) {
        subAdminId = table.subAdmin;
        if (orderType === "Dine In" && table.status === "occupied") {
          const activeOrder = await Order.findOne({
            table: table._id,
            status: { $in: ["pending", "preparing"] }
          }).sort({ createdAt: -1 });

          if (activeOrder && activeOrder.customerPhone !== phone) {
            return res.status(400).json({ message: "Table is already occupied by another customer. If this is a mistake, please contact restaurant staff." });
          }
        }
      }
    }

    if (!subAdminId) {
      return res.status(400).json({ message: "Invalid table ID" });
    }

    const subAdmin = await SubAdmin.findById(subAdminId);
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

    // Find or create user
    let user = await User.findOne({ phone, subAdmin: subAdminId });
    if (!user) {
      user = await User.create({
        name: `Guest ${phone.substring(Math.max(0, phone.length - 4))}`,
        phone,
        email: `${phone}@guest.local`,
        subAdmin: subAdminId,
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
        table: orderType === "Dine In" ? table?._id : null,
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
        subAdmin: subAdminId
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
    const orders = await Order.find({ customerPhone: phone }).sort({ createdAt: -1 });
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
    const subAdmin = await SubAdmin.findById(subAdminId).select("name themeColor logo");
    if (!subAdmin) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    const orders = await Order.find({
      subAdmin: subAdminId,
      status: { $in: ["pending", "preparing", "completed"] },
      createdAt: { $gte: cutoff }
    }).sort({ createdAt: 1 });

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

    const order = await Order.findByIdAndUpdate(orderId, { status }, { new: true });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (req.io) {
      req.io.to(order.subAdmin.toString()).emit("order_updated", order);
    }

    return res.json(order);
  } catch (error) {
    return next(error);
  }
});

export default router;
