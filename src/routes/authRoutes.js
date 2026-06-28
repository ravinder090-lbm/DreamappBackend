import jwt from "jsonwebtoken";
import { Router } from "express";
import { SubAdmin } from "../models/SubAdmin.js";
import { SuperAdmin } from "../models/SuperAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { geocodeAddress } from "../lib/googleMaps.js";


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
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth(["superadmin", "subadmin"]), (req, res) => {
  res.json({ user: req.user });
});

router.put("/profile", requireAuth(["subadmin"]), async (req, res, next) => {
  try {
    const { name, logo } = req.body;
    await SubAdmin.update({ name, logo }, { where: { id: req.user.id } });
    const subAdmin = await SubAdmin.findByPk(req.user.id);
    
    if (!subAdmin) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: subAdmin._id,
      name: subAdmin.name,
      email: subAdmin.email,
      logo: subAdmin.logo || "",
      role: "subadmin",
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
    const { address, deliveryRadius, lat, lng, themeColor, logo, enableDineIn, enableTakeAway, enableDelivery, enableCOD, sgstPercent, cgstPercent, deliveryCharges } = req.body;

    const updateData = {};
    if (address !== undefined) updateData.address = address;
    if (deliveryRadius !== undefined) updateData.deliveryRadius = Number(deliveryRadius) || 0;
    if (lat !== undefined) updateData.lat = Number(lat) || 0;
    if (lng !== undefined) updateData.lng = Number(lng) || 0;
    if (themeColor !== undefined) updateData.themeColor = themeColor;
    if (logo !== undefined) updateData.logo = logo;
    if (enableDineIn !== undefined) updateData.enableDineIn = !!enableDineIn;
    if (enableTakeAway !== undefined) updateData.enableTakeAway = !!enableTakeAway;
    if (enableDelivery !== undefined) updateData.enableDelivery = !!enableDelivery;
    if (enableCOD !== undefined) updateData.enableCOD = !!enableCOD;
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
        sgstPercent: subAdmin.sgstPercent || 0,
        cgstPercent: subAdmin.cgstPercent || 0,
        deliveryCharges: subAdmin.deliveryCharges || 0,
      }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
