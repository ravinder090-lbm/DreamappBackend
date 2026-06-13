import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { whatsappManager } from "../lib/whatsappManager.js";
import { SubAdmin } from "../models/SubAdmin.js";

const router = Router();

router.use(requireAuth(["subadmin"]));

router.get("/status", async (req, res, next) => {
  try {
    const subAdmin = await SubAdmin.findById(req.user.id);
    if (!subAdmin) {
      return res.status(404).json({ message: "Subadmin not found" });
    }

    const mgrStatus = whatsappManager.getStatus(req.user.id.toString());
    
    return res.json({
      whatsAppConnected: subAdmin.whatsAppConnected,
      whatsAppNumber: subAdmin.whatsAppNumber,
      active: mgrStatus.active,
      qr: mgrStatus.qr,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/connect", async (req, res, next) => {
  try {
    const subAdminId = req.user.id.toString();
    
    // Start or get session connection in background
    whatsappManager.connectSession(subAdminId).catch((err) => {
      console.error(`Error connecting WhatsApp for subadmin ${subAdminId}:`, err);
    });

    // Short sleep to allow the socket to try connecting and potentially get QR code
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    const mgrStatus = whatsappManager.getStatus(subAdminId);
    return res.json({
      message: "WhatsApp connection process started.",
      qr: mgrStatus.qr,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/disconnect", async (req, res, next) => {
  try {
    const subAdminId = req.user.id.toString();
    await whatsappManager.disconnectSession(subAdminId);
    return res.json({ message: "WhatsApp disconnected successfully." });
  } catch (error) {
    return next(error);
  }
});

router.post("/test", async (req, res, next) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ message: "Phone number and message are required." });
    }

    await whatsappManager.sendCustomMessage(req.user.id.toString(), phone, message);
    return res.json({ message: "Test message sent successfully!" });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.post("/send-bulk", async (req, res, next) => {
  try {
    const { recipients, message } = req.body;
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ message: "Recipients array is required." });
    }
    if (!message) {
      return res.status(400).json({ message: "Message text is required." });
    }

    const subAdminId = req.user.id.toString();
    const results = [];

    for (const phone of recipients) {
      try {
        await whatsappManager.sendCustomMessage(subAdminId, phone, message);
        results.push({ phone, status: "sent" });
        await new Promise((resolve) => setTimeout(resolve, 500)); // minor delay between messages
      } catch (err) {
        results.push({ phone, status: "failed", error: err.message });
      }
    }

    return res.json({
      message: "Bulk notification process completed.",
      results,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
