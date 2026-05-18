import jwt from "jsonwebtoken";
import { Router } from "express";
import { SubAdmin } from "../models/SubAdmin.js";
import { SuperAdmin } from "../models/SuperAdmin.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function createToken(user, role) {
  return jwt.sign(
    {
      id: user._id,
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
    const user = await Model.findOne({ email }).select("+password");

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
    const subAdmin = await SubAdmin.findByIdAndUpdate(
      req.user.id,
      { name, logo },
      { new: true, runValidators: true }
    );
    
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

export default router;
