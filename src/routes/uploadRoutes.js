import { Router } from "express";
import multer from "multer";
import { Readable } from "stream";
import { requireAuth } from "../middleware/auth.js";
import { uploadToB2, getFileStreamFromB2 } from "../lib/b2Storage.js";

const router = Router();

// Stream private B2 files to client (Unauthenticated GET)
router.get("/file/*", async (req, res, next) => {
  try {
    const key = req.params[0];
    if (!key) {
      return res.status(400).json({ message: "File key required" });
    }

    const { stream, contentType, contentLength } = await getFileStreamFromB2(key);

    res.setHeader("Content-Type", contentType);
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    if (stream.pipe) {
      stream.pipe(res);
    } else if (stream && typeof stream.getReader === "function") {
      Readable.fromWeb(stream).pipe(res);
    } else {
      const bytes = await stream.transformToByteArray();
      res.send(Buffer.from(bytes));
    }
  } catch (error) {
    console.error("Error streaming B2 file:", error.message);
    if (error.message.includes("credentials missing")) {
      return res.status(500).json({ message: "Server misconfiguration: Backblaze B2 credentials missing in environment variables." });
    }
    res.status(404).json({ message: "File not found" });
  }
});

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

router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    try {
      const publicUrl = await uploadToB2(req.file.buffer, req.file.originalname, req.file.mimetype);
      return res.status(201).json({ url: publicUrl });
    } catch (b2Error) {
      console.warn("Backblaze B2 upload error, falling back to base64 data URI:", b2Error.message);
      const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      return res.status(201).json({ url: base64Data });
    }
  } catch (error) {
    next(error);
  }
});

export default router;

