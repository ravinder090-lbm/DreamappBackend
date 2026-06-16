import { Router } from "express";
import { MenuItem } from "../models/MenuItem.js";
import { Table } from "../models/Table.js";
import { User } from "../models/User.js";
import { Order } from "../models/Order.js";
import { Banner } from "../models/Banner.js";
import { SubAdmin } from "../models/SubAdmin.js";
import { whatsappManager } from "../lib/whatsappManager.js";

const router = Router();

router.get("/menu/:tableId", async (req, res, next) => {
  try {
    const table = await Table.findById(req.params.tableId);

    if (!table || table.status === "inactive") {
      return res.status(404).json({ message: "Table not found" });
    }

    const [menuItems, banners] = await Promise.all([
      MenuItem.find({ available: true, subAdmin: table.subAdmin })
        .populate("category")
        .sort({ createdAt: -1 }),
      Banner.find({ status: "active", subAdmin: table.subAdmin })
        .sort({ createdAt: -1 }),
    ]);

    return res.json({ table, menuItems, banners });
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
    const { phone, otp, tableId, cart, orderType = "Dine In", address } = req.body;

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
      }
    }

    if (!subAdminId) {
      return res.status(400).json({ message: "Invalid table ID" });
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
      const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      
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
        total,
        subAdmin: subAdminId
      });
      
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
    const { phone, tableId, cart, orderType = "Dine In", address } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone is required" });
    }

    let subAdminId = null;
    let table = null;
    if (tableId) {
      table = await Table.findById(tableId);
      if (table) {
        subAdminId = table.subAdmin;
      }
    }

    if (!subAdminId) {
      return res.status(400).json({ message: "Invalid table ID" });
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
      const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      
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
        total,
        subAdmin: subAdminId
      });

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

export default router;
