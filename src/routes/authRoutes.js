import jwt from "jsonwebtoken";
import { Router } from "express";
import { SubAdmin } from "../models/SubAdmin.js";
import { SuperAdmin } from "../models/SuperAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { geocodeAddress } from "../lib/googleMaps.js";
import { whatsappManager } from "../lib/whatsappManager.js";
import { Op } from "sequelize";

const router = Router();

function createToken(user, role) {
  return jwt.sign(
    {
      id: user.id || user._id,
      name: user.name,
      email: user.email,
      role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
}

router.post("/login", async (req, res, next) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ message: "Email, password, and role are required" });
    }

    const Model = role === "superadmin" ? SuperAdmin : SubAdmin;
    const user = await Model.findOne({ where: { email } });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (role === "subadmin" && user.status !== "active") {
      return res.status(403).json({ message: "This subadmin account is inactive" });
    }

    const token = createToken(user, role);

    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        logo: user.logo || "",
        role,
        ...(role === "subadmin" && { subscriptionPlan: await user.getSubscriptionPlan() })
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth(["superadmin", "subadmin"]), async (req, res, next) => {
  try {
    if (req.user.role === "subadmin") {
      const subAdmin = await SubAdmin.findByPk(req.user.id, { include: ["subscriptionPlan"] });
      if (subAdmin) {
        return res.json({ user: { ...req.user, subscriptionPlan: subAdmin.subscriptionPlan } });
      }
    }
    res.json({ user: req.user });
  } catch (error) {
    next(error);
  }
});

router.put("/profile", requireAuth(["subadmin"]), async (req, res, next) => {
  try {
    const { name, logo } = req.body;
    await SubAdmin.update({ name, logo }, { where: { id: req.user.id } });
    const subAdmin = await SubAdmin.findByPk(req.user.id, { include: ["subscriptionPlan"] });
    
    if (!subAdmin) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: subAdmin._id,
      name: subAdmin.name,
      email: subAdmin.email,
      logo: subAdmin.logo || "",
      role: "subadmin",
      subscriptionPlan: subAdmin.subscriptionPlan
    });
  } catch (error) {
    next(error);
  }
});

router.put("/change-password", requireAuth(["subadmin"]), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters long" });
    }

    const subAdmin = await SubAdmin.findByPk(req.user.id);
    if (!subAdmin) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await subAdmin.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect current password" });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: "New password cannot be the same as your current password" });
    }

    subAdmin.password = newPassword;
    await subAdmin.save();

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    next(error);
  }
});

router.get("/config", requireAuth(["subadmin"]), async (req, res, next) => {
  try {
    const subAdmin = await SubAdmin.findByPk(req.user.id);
    if (!subAdmin) {
      return res.status(404).json({ message: "Subadmin not found" });
    }
    return res.json({
      address: subAdmin.address || "",
      deliveryRadius: subAdmin.deliveryRadius || 0,
      lat: subAdmin.lat || 0,
      lng: subAdmin.lng || 0,
      themeColor: subAdmin.themeColor || "#1d6f56",
      logo: subAdmin.logo || "",
      enableDineIn: subAdmin.enableDineIn !== false,
      enableTakeAway: subAdmin.enableTakeAway !== false,
      enableDelivery: subAdmin.enableDelivery !== false,
      enableCOD: subAdmin.enableCOD !== false,
      autoAcceptOrders: subAdmin.autoAcceptOrders !== false,
      publicMenuTheme: subAdmin.publicMenuTheme || "default",
      waiterTone: subAdmin.waiterTone || "default",
      orderTone: subAdmin.orderTone || "default",
      sgstPercent: subAdmin.sgstPercent || 0,
      cgstPercent: subAdmin.cgstPercent || 0,
      deliveryCharges: subAdmin.deliveryCharges || 0,
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/config", requireAuth(["subadmin"]), async (req, res, next) => {
  try {
    const { address, deliveryRadius, lat, lng, themeColor, publicMenuTheme, waiterTone, orderTone, logo, enableDineIn, enableTakeAway, enableDelivery, enableCOD, autoAcceptOrders, sgstPercent, cgstPercent, deliveryCharges } = req.body;

    const updateData = {};
    if (address !== undefined) updateData.address = address;
    if (deliveryRadius !== undefined) updateData.deliveryRadius = Number(deliveryRadius) || 0;
    if (lat !== undefined) updateData.lat = Number(lat) || 0;
    if (lng !== undefined) updateData.lng = Number(lng) || 0;
    if (themeColor !== undefined) updateData.themeColor = themeColor;
    if (publicMenuTheme !== undefined) updateData.publicMenuTheme = publicMenuTheme;
    if (waiterTone !== undefined) updateData.waiterTone = waiterTone;
    if (orderTone !== undefined) updateData.orderTone = orderTone;
    if (logo !== undefined) updateData.logo = logo;
    if (enableDineIn !== undefined) updateData.enableDineIn = !!enableDineIn;
    if (enableTakeAway !== undefined) updateData.enableTakeAway = !!enableTakeAway;
    if (enableDelivery !== undefined) updateData.enableDelivery = !!enableDelivery;
    if (enableCOD !== undefined) updateData.enableCOD = !!enableCOD;
    if (autoAcceptOrders !== undefined) updateData.autoAcceptOrders = !!autoAcceptOrders;
    if (sgstPercent !== undefined) updateData.sgstPercent = Number(sgstPercent) || 0;
    if (cgstPercent !== undefined) updateData.cgstPercent = Number(cgstPercent) || 0;
    if (deliveryCharges !== undefined) updateData.deliveryCharges = Number(deliveryCharges) || 0;

    if (updateData.address && (!updateData.lat || !updateData.lng)) {
      const coords = await geocodeAddress(updateData.address);
      if (coords) {
        updateData.lat = coords.lat;
        updateData.lng = coords.lng;
      }
    }

    await SubAdmin.update(updateData, { where: { id: req.user.id } });
    const subAdmin = await SubAdmin.findByPk(req.user.id);
    if (!subAdmin) {
      return res.status(404).json({ message: "Subadmin not found" });
    }
    return res.json({
      message: "Configuration updated successfully",
      config: {
        address: subAdmin.address || "",
        deliveryRadius: subAdmin.deliveryRadius || 0,
        lat: subAdmin.lat || 0,
        lng: subAdmin.lng || 0,
        themeColor: subAdmin.themeColor || "#1d6f56",
        logo: subAdmin.logo || "",
        enableDineIn: subAdmin.enableDineIn !== false,
        enableTakeAway: subAdmin.enableTakeAway !== false,
        enableDelivery: subAdmin.enableDelivery !== false,
        enableCOD: subAdmin.enableCOD !== false,
        autoAcceptOrders: subAdmin.autoAcceptOrders !== false,
        publicMenuTheme: subAdmin.publicMenuTheme || "default",
        waiterTone: subAdmin.waiterTone || "default",
        orderTone: subAdmin.orderTone || "default",
        sgstPercent: subAdmin.sgstPercent || 0,
        cgstPercent: subAdmin.cgstPercent || 0,
        deliveryCharges: subAdmin.deliveryCharges || 0,
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ message: "WhatsApp number is required." });
    }

    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      cleaned = "91" + cleaned;
    }

    const subAdmin = await SubAdmin.findOne({
      where: {
        [Op.or]: [
          { whatsAppNumber: cleaned },
          { phone: cleaned }
        ]
      }
    });

    if (!subAdmin) {
      return res.status(404).json({ message: "No user found with this number." });
    }

    if (!subAdmin.whatsAppConnected) {
      return res.status(400).json({ message: "Your WhatsApp is not connected. Please contact the administrator to change your password." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    subAdmin.resetPasswordOtp = otp;
    subAdmin.resetPasswordOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await subAdmin.save();

    await whatsappManager.sendOTP(subAdmin.id, subAdmin.whatsAppNumber, otp);

    return res.json({ message: "OTP sent to your WhatsApp number." });
  } catch (error) {
    return next(error);
  }
});

router.post("/verify-otp", async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ message: "WhatsApp number and OTP are required." });
    }

    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      cleaned = "91" + cleaned;
    }

    const subAdmin = await SubAdmin.findOne({
      where: {
        whatsAppNumber: cleaned,
        resetPasswordOtp: otp,
        resetPasswordOtpExpires: { [Op.gt]: new Date() }
      }
    });

    if (!subAdmin) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    return res.json({ message: "OTP verified successfully." });
  } catch (error) {
    return next(error);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const { phone, otp, newPassword } = req.body;
    if (!phone || !otp || !newPassword) {
      return res.status(400).json({ message: "All fields are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters long." });
    }

    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      cleaned = "91" + cleaned;
    }

    const subAdmin = await SubAdmin.findOne({
      where: {
        whatsAppNumber: cleaned,
        resetPasswordOtp: otp,
        resetPasswordOtpExpires: { [Op.gt]: new Date() }
      }
    });

    if (!subAdmin) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    subAdmin.password = newPassword;
    subAdmin.resetPasswordOtp = null;
    subAdmin.resetPasswordOtpExpires = null;
    await subAdmin.save();

    return res.json({ message: "Password reset successfully." });
  } catch (error) {
    return next(error);
  }
});

export default router;
