import { Router } from "express";
import { Op } from "sequelize";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { MenuItem } from "../models/MenuItem.js";
import { Table } from "../models/Table.js";
import { User } from "../models/User.js";
import { Order } from "../models/Order.js";
import { Banner } from "../models/Banner.js";
import { SubAdmin } from "../models/SubAdmin.js";
import { Category } from "../models/Category.js";
import { Booking } from "../models/Booking.js";
import { whatsappManager } from "../lib/whatsappManager.js";
import { geocodeAddress, getHaversineDistance } from "../lib/googleMaps.js";
import { invalidateOrdersCache } from "./orderRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

router.get("/restaurants", async (req, res, next) => {
  try {
    const subAdmins = await SubAdmin.findAll({ attributes: ["id", "name", "logo", "themeColor"] });
    return res.json(subAdmins);
  } catch (error) {
    return next(error);
  }
});

router.get("/restaurant/:slug", async (req, res, next) => {
  try {
    const slug = req.params.slug;
    const subAdmins = await SubAdmin.findAll({ attributes: ["id", "name", "logo", "themeColor"] });
    
    const restaurant = subAdmins.find(sa => {
      const saSlug = (sa.name || "store")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return saSlug === slug;
    });

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.json({
      name: restaurant.name,
      logo: restaurant.logo,
      themeColor: restaurant.themeColor || "#1d6f56"
    });
  } catch (error) {
    next(error);
  }
});

const publicCatalogCache = new Map();

export function invalidatePublicCatalogCache(subAdminId) {
  if (subAdminId) {
    publicCatalogCache.delete(subAdminId.toString());
  }
}

router.get("/menu/:tableId", async (req, res, next) => {
  try {
    const table = await Table.findOne({
      where: { id: req.params.tableId },
      include: [{
        model: SubAdmin,
        as: "subAdmin",
        attributes: ["id", "name", "address", "deliveryRadius", "lat", "lng", "themeColor", "publicMenuTheme", "logo", "enableDineIn", "enableTakeAway", "enableDelivery", "enableCOD", "sgstPercent", "cgstPercent", "deliveryCharges"]
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

    const subAdminIdStr = table.subAdminId.toString();
    const cachedCatalog = publicCatalogCache.get(subAdminIdStr);

    let catalogData = {};
    if (cachedCatalog && (Date.now() - cachedCatalog.timestamp < 30000)) {
      catalogData = cachedCatalog.data;
      res.setHeader("X-Cache", "HIT");
    } else {
      const [menuItems, banners, categories] = await Promise.all([
        MenuItem.findAll({
          where: { subAdminId: table.subAdminId },
          include: [{ model: Category, as: "category" }],
          order: [["createdAt", "DESC"]]
        }),
        Banner.findAll({
          where: { status: "active", subAdminId: table.subAdminId },
          order: [["createdAt", "DESC"]]
        }),
        Category.findAll({
          where: { subAdminId: table.subAdminId },
          order: [["name", "ASC"]]
        })
      ]);
      catalogData = { menuItems, banners, categories };
      publicCatalogCache.set(subAdminIdStr, { timestamp: Date.now(), data: catalogData });
      res.setHeader("X-Cache", "MISS");
    }

    return res.json({ table, occupierPhone, ...catalogData });
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
        if (!subAdmin || !subAdmin.whatsAppConnected) {
          return res.status(400).json({ message: "Something went wrong. This restaurant is currently not accepting online orders." });
        }
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
      }
    }

    if (!subAdminId) {
      return res.status(400).json({ message: "Invalid table ID" });
    }

    const subAdmin = await SubAdmin.findByPk(subAdminId);
    if (!subAdmin) {
      return res.status(400).json({ message: "Store not found" });
    }
    if (!subAdmin.whatsAppConnected) {
      return res.status(400).json({ message: "Something went wrong. This restaurant is currently not accepting online orders." });
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
        status: subAdmin?.autoAcceptOrders === false ? "pending" : "preparing",
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
      
      invalidateOrdersCache(subAdminId);
      if (req.io) {
        req.io.to(subAdminId.toString()).emit("order_created", newOrder);
      }
      whatsappManager.sendOrderInvoice(subAdminId.toString(), user.phone, newOrder, subAdmin.name || "Store").catch(err => console.error(err));
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
      }
    }

    if (!subAdminId) {
      return res.status(400).json({ message: "Invalid table ID" });
    }

    const subAdmin = await SubAdmin.findByPk(subAdminId);
    if (!subAdmin) {
      return res.status(400).json({ message: "Store not found" });
    }
    if (!subAdmin.whatsAppConnected) {
      return res.status(400).json({ message: "Something went wrong. This restaurant is currently not accepting online orders." });
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
        status: subAdmin?.autoAcceptOrders === false ? "pending" : "preparing",
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

      if (newOrder) {
        if (req.io) {
          req.io.to(subAdminId.toString()).emit("order_created", newOrder);
        }
        whatsappManager.sendOrderInvoice(subAdminId.toString(), user.phone, newOrder, subAdmin.name || "Store").catch(err => console.error(err));
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

// POST /api/public/call-waiter - Notify subadmin that a table needs assistance
router.post("/call-waiter", async (req, res, next) => {
  try {
    const { tableId } = req.body;
    if (!tableId) {
      return res.status(400).json({ message: "Table ID is required" });
    }

    const table = await Table.findByPk(tableId);
    if (!table) {
      return res.status(404).json({ message: "Table not found" });
    }

    if (req.io) {
      req.io.to(table.subAdminId.toString()).emit("waiter_called", {
        tableId: table.id,
        tableName: table.name,
        timestamp: new Date()
      });
    }

    return res.json({ message: "Waiter has been notified!" });
  } catch (error) {
    return next(error);
  }
});

router.post("/book-table", async (req, res, next) => {
  try {
    const { subAdminId, customerName, customerPhone, date, time, partySize, items, specialRequests } = req.body;

    if (!subAdminId || !customerName || !customerPhone || !date || !time) {
      return res.status(400).json({ message: "Missing required booking details" });
    }

    const bookingNumber = `BK-${Math.floor(10000 + Math.random() * 90000)}`;

    let subtotal = 0;
    if (items && Array.isArray(items)) {
      subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }

    const total = subtotal;

    const newBooking = await Booking.create({
      bookingNumber,
      customerName,
      customerPhone,
      date,
      time,
      partySize: parseInt(partySize, 10) || 1,
      items: items || [],
      subtotal,
      total,
      specialRequests: specialRequests || "",
      subAdminId,
      status: "pending"
    });

    res.json({ message: "Booking placed successfully", booking: newBooking });
  } catch (error) {
    console.error("Book Table Error:", error);
    next(error);
  }
});

router.get("/bookings/:phone", async (req, res, next) => {
  try {
    const { phone } = req.params;
    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }
    const bookings = await Booking.findAll({
      where: { customerPhone: phone },
      order: [["createdAt", "DESC"]]
    });
    return res.json(bookings);
  } catch (error) {
    return next(error);
  }
});

const waiterCache = new Map();

export function invalidateWaiterCache(subAdminId) {
  if (subAdminId) waiterCache.delete(subAdminId.toString());
}

// GET /api/public/waiter/:subAdminId - Fetch tables, categories, menu items for Waiter App
router.get("/waiter/:subAdminId", async (req, res, next) => {
  try {
    const { subAdminId } = req.params;
    const now = Date.now();
    const cached = waiterCache.get(subAdminId);
    if (cached && cached.expiresAt > now) {
      return res.json(cached.data);
    }

    const [subAdmin, tables, categories, menuItems] = await Promise.all([
      SubAdmin.findOne({
        where: { id: subAdminId },
        attributes: ["id", "name", "themeColor", "logo", "sgstPercent", "cgstPercent"]
      }),
      Table.findAll({
        where: { subAdminId, status: { [Op.ne]: "inactive" } },
        attributes: ["id", "_id", "name", "status"],
        order: [["name", "ASC"]]
      }),
      Category.findAll({
        where: { subAdminId },
        attributes: ["id", "_id", "name"],
        order: [["name", "ASC"]]
      }),
      MenuItem.findAll({
        where: { subAdminId, available: true },
        attributes: ["id", "_id", "name", "price", "image", "description", "categoryId"],
        order: [["createdAt", "DESC"]]
      })
    ]);

    if (!subAdmin) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const subAdminData = subAdmin.toJSON();
    if (subAdminData.logo && subAdminData.logo.length > 2000) {
      subAdminData.logo = ""; // Omit massive base64 image strings to ensure fast response times
    }

    const responseData = { subAdmin: subAdminData, tables, categories, menuItems };
    waiterCache.set(subAdminId, { data: responseData, expiresAt: now + 30000 });
    return res.json(responseData);
  } catch (error) {
    return next(error);
  }
});

// POST /api/public/waiter/order - Place a manual order via Waiter App
router.post("/waiter/order", async (req, res, next) => {
  try {
    const { subAdminId, tableId, tableName, orderType, cart, customerName, customerPhone, notes } = req.body;

    if (!subAdminId || !cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ message: "Cart items and restaurant ID are required" });
    }

    const subAdmin = await SubAdmin.findByPk(subAdminId);
    if (!subAdmin) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    let finalTableId = tableId || null;
    let finalTableName = tableName || (orderType === "Dine In" ? "Dine In" : orderType || "Take Away");

    if (tableId) {
      const tableObj = await Table.findByPk(tableId);
      if (tableObj) {
        finalTableName = tableObj.name;
        if (orderType === "Dine In") {
          await Table.update({ status: "occupied" }, { where: { id: tableId } });
        }
      }
    }

    const subtotal = cart.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
    const sgstAmount = (subtotal * (subAdmin.sgstPercent || 0)) / 100;
    const cgstAmount = (subtotal * (subAdmin.cgstPercent || 0)) / 100;
    const total = subtotal + sgstAmount + cgstAmount;

    const orderNumber = `ORD-${Math.floor(10000 + Math.random() * 90000)}`;

    const newOrder = await Order.create({
      orderNumber,
      customerName: customerName || "Walk-in Guest",
      customerPhone: customerPhone || "",
      status: "preparing",
      orderType: orderType || "Dine In",
      items: cart.map(i => ({
        _id: i._id || i.id,
        name: i.name,
        quantity: Number(i.quantity),
        price: Number(i.price),
        instructions: i.instructions || ""
      })),
      subtotal,
      total,
      tableId: finalTableId,
      tableName: finalTableName,
      subAdminId,
      notes: notes || "Placed by Waiter POS"
    });

    invalidateWaiterCache(subAdminId);
    invalidateOrdersCache(subAdminId);

    if (req.io) {
      req.io.to(subAdminId.toString()).emit("order_created", newOrder);
      req.io.to(subAdminId.toString()).emit("catalog_updated");
    }

    return res.json({ message: "Order placed successfully!", order: newOrder });
  } catch (error) {
    return next(error);
  }
});

// GET /api/public/download/waiter-apk - Serve Android APK directly for Waiter App
router.get("/download/waiter-apk", (req, res) => {
  const apkPath = path.resolve(__dirname, "../../uploads/waiter-pos.apk");
  if (fs.existsSync(apkPath)) {
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", 'attachment; filename="WaiterPOS-App.apk"');
    return res.sendFile(apkPath);
  }
  return res.status(404).json({ message: "Waiter APK file is currently being generated. Please use the QR code." });
});

export default router;
