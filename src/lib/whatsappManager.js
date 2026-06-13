import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SubAdmin } from "../models/SubAdmin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = process.env.VERCEL
  ? path.join("/tmp", "sessions")
  : path.join(__dirname, "../../../sessions");

// Ensure sessions directory exists
if (process.env.VERCEL) {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("Could not create sessions directory in /tmp:", err.message);
  }
} else {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

class WhatsAppManager {
  constructor() {
    this.sockets = new Map(); // subAdminId -> socket instance
    this.qrCodes = new Map(); // subAdminId -> current QR code data URL
    this.io = null; // socket.io server instance
  }

  setIo(io) {
    this.io = io;
  }

  // Restore previously connected sessions on startup
  async initializeAll() {
    if (process.env.VERCEL) {
      console.warn("Skipping WhatsApp session initialization in serverless environment (Vercel).");
      return;
    }
    try {
      const activeSubAdmins = await SubAdmin.find({ whatsAppConnected: true });
      console.log(`Restoring ${activeSubAdmins.length} WhatsApp session(s)...`);
      for (const sa of activeSubAdmins) {
        this.connectSession(sa._id.toString()).catch((err) => {
          console.error(`Failed to restore WhatsApp session for subadmin ${sa._id}:`, err);
        });
      }
    } catch (error) {
      console.error("Error restoring WhatsApp sessions:", error);
    }
  }

  async connectSession(subAdminId) {
    if (process.env.VERCEL) {
      throw new Error("WhatsApp connection is not supported on serverless hosting (Vercel). Please run the server on a persistent hosting platform (e.g., Heroku, Render, VPS).");
    }
    if (this.sockets.has(subAdminId)) {
      console.log(`Session already active for subadmin ${subAdminId}`);
      return this.sockets.get(subAdminId);
    }

    const sessionDir = path.join(SESSIONS_DIR, `subadmin_${subAdminId}`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const logger = pino({ level: "silent" });
    const sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
    });

    this.sockets.set(subAdminId, sock);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr);
          this.qrCodes.set(subAdminId, qrDataUrl);
          
          // Emit QR code to subadmin if Socket.io is initialized
          if (this.io) {
            this.io.to(subAdminId).emit("whatsapp_qr", { qr: qrDataUrl });
          }
        } catch (err) {
          console.error(`Error generating QR code for subadmin ${subAdminId}:`, err);
        }
      }

      if (connection === "connecting") {
        console.log(`Connecting WhatsApp for subadmin ${subAdminId}...`);
        if (this.io) {
          this.io.to(subAdminId).emit("whatsapp_status", { status: "connecting" });
        }
      }

      if (connection === "open") {
        console.log(`WhatsApp connected successfully for subadmin ${subAdminId}!`);
        this.qrCodes.delete(subAdminId);
        
        let whatsAppNumber = sock.user.id;
        // Clean up WhatsApp ID format to just the number
        if (whatsAppNumber.includes(":")) {
          whatsAppNumber = whatsAppNumber.split(":")[0];
        } else if (whatsAppNumber.includes("@")) {
          whatsAppNumber = whatsAppNumber.split("@")[0];
        }

        await SubAdmin.findByIdAndUpdate(subAdminId, {
          whatsAppConnected: true,
          whatsAppNumber: whatsAppNumber,
        });

        if (this.io) {
          this.io.to(subAdminId).emit("whatsapp_status", {
            status: "connected",
            number: whatsAppNumber,
          });
        }
      }

      if (connection === "close") {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`WhatsApp connection closed for subadmin ${subAdminId}. Reconnecting: ${shouldReconnect}`);

        this.sockets.delete(subAdminId);

        if (shouldReconnect) {
          // Attempt reconnection
          setTimeout(() => {
            this.connectSession(subAdminId).catch((err) => {
              console.error(`Reconnection failed for subadmin ${subAdminId}:`, err);
            });
          }, 3000);
        } else {
          // Logged out
          console.log(`Subadmin ${subAdminId} logged out of WhatsApp Web.`);
          this.qrCodes.delete(subAdminId);
          await SubAdmin.findByIdAndUpdate(subAdminId, {
            whatsAppConnected: false,
            whatsAppNumber: "",
          });

          // Clean up session files
          try {
            if (fs.existsSync(sessionDir)) {
              fs.rmSync(sessionDir, { recursive: true, force: true });
            }
          } catch (err) {
            console.error(`Failed to clean session folder for subadmin ${subAdminId}:`, err);
          }

          if (this.io) {
            this.io.to(subAdminId).emit("whatsapp_status", { status: "disconnected" });
          }
        }
      }
    });

    return sock;
  }

  async disconnectSession(subAdminId) {
    const sock = this.sockets.get(subAdminId);
    if (sock) {
      try {
        await sock.logout();
      } catch (err) {
        console.error(`Error during socket logout for subadmin ${subAdminId}:`, err);
        sock.end();
      }
      this.sockets.delete(subAdminId);
    }

    this.qrCodes.delete(subAdminId);
    await SubAdmin.findByIdAndUpdate(subAdminId, {
      whatsAppConnected: false,
      whatsAppNumber: "",
    });

    const sessionDir = path.join(SESSIONS_DIR, `subadmin_${subAdminId}`);
    try {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`Failed to clean session folder on disconnect for subadmin ${subAdminId}:`, err);
    }

    if (this.io) {
      this.io.to(subAdminId).emit("whatsapp_status", { status: "disconnected" });
    }
  }

  async sendOTP(subAdminId, phone, otp) {
    const sock = this.sockets.get(subAdminId);
    if (!sock) {
      throw new Error("WhatsApp is not connected for this store.");
    }

    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      cleaned = "91" + cleaned; // Assume India prefix if 10 digits
    }
    const jid = `${cleaned}@s.whatsapp.net`;

    const message = `Your verification code is: *${otp}*. Please do not share this OTP with anyone.`;
    await sock.sendMessage(jid, { text: message });
    console.log(`WhatsApp OTP sent to ${cleaned} via subadmin ${subAdminId}`);
  }

  async sendCustomMessage(subAdminId, phone, text) {
    const sock = this.sockets.get(subAdminId);
    if (!sock) {
      throw new Error("WhatsApp is not connected for this store.");
    }

    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      cleaned = "91" + cleaned;
    }
    const jid = `${cleaned}@s.whatsapp.net`;

    await sock.sendMessage(jid, { text });
    console.log(`WhatsApp custom message sent to ${cleaned} via subadmin ${subAdminId}`);
  }

  getStatus(subAdminId) {
    const active = this.sockets.has(subAdminId);
    const qr = this.qrCodes.get(subAdminId);
    return {
      active,
      qr: qr || null,
    };
  }
}

export const whatsappManager = new WhatsAppManager();
