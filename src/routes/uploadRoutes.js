import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Configure multer memory storage
const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images and audio files are allowed"));
    }
  }
});

// We only allow subadmins (and superadmins if needed, but categories/menu items are subadmin)
router.use(requireAuth(["subadmin", "superadmin"]));

router.post("/", upload.single("file"), (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    // Convert file buffer to Base64 data URI
    const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    res.status(201).json({ url: base64Data });
  } catch (error) {
    next(error);
  }
});

export default router;
