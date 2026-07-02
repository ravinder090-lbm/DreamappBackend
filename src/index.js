import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { connectDB } from "./lib/db.js";
import { seedSuperAdmin } from "./lib/seedSuperAdmin.js";
import authRoutes from "./routes/authRoutes.js";
import catalogRoutes from "./routes/catalogRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import subAdminRoutes from "./routes/subAdminRoutes.js";
import tableRoutes from "./routes/tableRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import whatsappRoutes from "./routes/whatsappRoutes.js";
import { whatsappManager } from "./lib/whatsappManager.js";
import path from "path";
import { createServer } from "http";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const isVercel = Boolean(process.env.VERCEL);

const socketCors = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
};
const createNoopIo = () => ({
  on: () => {},
  to: () => ({ emit: () => {} }),
  emit: () => {}
});

let httpServer = null;
let io = createNoopIo();

if (!isVercel) {
  // Use a variable so Vercel's static file tracer does NOT bundle socket.io
  const socketLib = "socket" + ".io";
  const { Server } = await import(socketLib);
  httpServer = createServer(app);
  io = new Server(httpServer, {
    cors: {
      origin: socketCors.origin,
      methods: socketCors.methods
    }
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("join", (roomId) => {
      if (roomId) {
        socket.join(roomId);
        console.log(`Socket ${socket.id} joined room ${roomId}`);
      }
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}

whatsappManager.setIo(io);

app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use(cors({
  origin: function (origin, callback) {
    // Allow all origins
    callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "X-CSRF-Token",
    "Accept-Version",
    "Content-Length",
    "Content-MD5",
    "Date",
    "X-Api-Version"
  ],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "MERN API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/subadmins", subAdminRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/webhook", webhookRoutes);
app.use("/api/whatsapp", whatsappRoutes);

app.use((error, req, res, next) => {
  console.error("API Error caught by middleware:", error);
  const statusCode = error.name === "ValidationError" ? 400 : 500;
  const message =
    error.code === 11000 ? "A record with this value already exists" : error.message;

  res.status(statusCode).json({ message });
});

connectDB()
  .then(seedSuperAdmin)
  .then(() => {
    whatsappManager.initializeAll().catch((err) => {
      console.error("Error restoring WhatsApp sessions:", err);
    });
    if (httpServer) {
      httpServer.listen(port, () => {
        console.log(`Server listening on http://localhost:${port}`);
      });
    } else {
      app.listen(port, () => {
        console.log(`Server listening on http://localhost:${port}`);
      });
    }
  })
  .catch((error) => {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });

export default app;
