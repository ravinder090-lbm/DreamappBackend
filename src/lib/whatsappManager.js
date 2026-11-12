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
    this.reconnectAttempts = new Map();
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
      const activeSubAdmins = await SubAdmin.findAll({ where: { whatsAppConnected: true } });
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
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = await import("@whiskeysockets/baileys");
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WhatsApp Web version v${version.join('.')}, isLatest: ${isLatest}`);

    const logger = pino({ level: "silent" });
    const sock = makeWASocket({
      version,
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
        this.reconnectAttempts.delete(subAdminId);
        
        let whatsAppNumber = sock.user.id;
        // Clean up WhatsApp ID format to just the number
        if (whatsAppNumber.includes(":")) {
          whatsAppNumber = whatsAppNumber.split(":")[0];
        } else if (whatsAppNumber.includes("@")) {
          whatsAppNumber = whatsAppNumber.split("@")[0];
        }

        try {
          await SubAdmin.update({
            whatsAppConnected: true,
            whatsAppNumber: whatsAppNumber,
          }, { where: { id: subAdminId } });
        } catch (dbErr) {
          console.error(`Database error during whatsapp connect for subadmin ${subAdminId}:`, dbErr.message);
        }

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
        console.log(`Disconnect Error:`, lastDisconnect?.error);

        this.sockets.delete(subAdminId);

        if (shouldReconnect) {
          const attempts = (this.reconnectAttempts.get(subAdminId) || 0) + 1;
          this.reconnectAttempts.set(subAdminId, attempts);
          if (attempts <= 5) {
            const delay = Math.min(30000, 3000 * Math.pow(1.5, attempts - 1));
            console.log(`Scheduling WhatsApp reconnect attempt ${attempts}/5 in ${Math.round(delay / 1000)}s for subadmin ${subAdminId}`);
            setTimeout(() => {
              this.connectSession(subAdminId).catch((err) => {
                console.error(`Reconnection failed for subadmin ${subAdminId}:`, err);
              });
            }, delay);
          } else {
            console.warn(`Max reconnection attempts reached for subadmin ${subAdminId}.`);
            this.reconnectAttempts.delete(subAdminId);
            if (this.io) {
              this.io.to(subAdminId).emit("whatsapp_status", { status: "disconnected", reason: "max_reconnect_exceeded" });
            }
          }
        } else {
          // Logged out
          console.log(`Subadmin ${subAdminId} logged out of WhatsApp Web.`);
          this.qrCodes.delete(subAdminId);
          try {
            await SubAdmin.update({
              whatsAppConnected: false,
              whatsAppNumber: "",
            }, { where: { id: subAdminId } });
          } catch (dbErr) {
            console.error(`Database error during whatsapp disconnect for subadmin ${subAdminId}:`, dbErr.message);
          }

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
    try {
      await SubAdmin.update({
        whatsAppConnected: false,
        whatsAppNumber: "",
      }, { where: { id: subAdminId } });
    } catch (dbErr) {
      console.error(`Database error during whatsapp disconnectSession for subadmin ${subAdminId}:`, dbErr.message);
    }

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
    const sock = this.sockets.get(subAdminId.toString());
    if (!sock) {
      throw new Error("WhatsApp is not connected for this store.");
    }

    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      cleaned = "91" + cleaned; // Assume India prefix if 10 digits
    }
    const jid = `${cleaned}@s.whatsapp.net`;

    const message = `Your verification code is: *${otp}*. Please do not share this OTP with anyone.`;
    
    // Add a 5 second timeout so the backend request doesn't hang if Baileys is stuck
    await Promise.race([
      sock.sendMessage(jid, { text: message }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("WhatsApp send timeout")), 5000))
    ]);
    
    console.log(`WhatsApp OTP sent to ${cleaned} via subadmin ${subAdminId}`);
  }

  async sendCustomMessage(subAdminId, phone, text) {
    const sock = this.sockets.get(subAdminId.toString());
    if (!sock) {
      throw new Error("WhatsApp is not connected for this store.");
    }

    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      cleaned = "91" + cleaned;
    }
    const jid = `${cleaned}@s.whatsapp.net`;

    await Promise.race([
      sock.sendMessage(jid, { text }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("WhatsApp send timeout")), 5000))
    ]);
    
    console.log(`WhatsApp custom message sent to ${cleaned} via subadmin ${subAdminId}`);
  }

  async sendOrderInvoice(subAdminId, phone, order, storeName, receiptUrl) {
    const sock = this.sockets.get(subAdminId.toString());
    if (!sock || !phone) return;

    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) cleaned = "91" + cleaned;
    if (cleaned.length < 10) return; // Invalid phone
    const jid = `${cleaned}@s.whatsapp.net`;

    const items = order.items || [];
    let itemsText = items.map(item => `  • ${item.quantity}x ${item.name} - ₹${(Number(item.price) * Number(item.quantity)).toFixed(2)}`).join("\n");
    
    const formattedDate = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

    let message = `🍽️ *${storeName}*
━━━━━━━━━━━━━━━━━━━━
🧾 *DIGITAL ORDER RECEIPT*
━━━━━━━━━━━━━━━━━━━━
*Order #:* ${order.orderNumber}
*Date:* ${formattedDate}
*Order Type:* ${order.orderType || "Dine In"}${order.tableName ? ` (${order.tableName})` : ''}
*Status:* *${(order.status || "preparing").toUpperCase()}*

*Order Items:*
${itemsText || "  (No items listed)"}

━━━━━━━━━━━━━━━━━━━━
Subtotal: ₹${Number(order.subtotal || 0).toFixed(2)}
${order.sgstAmount ? `SGST: ₹${Number(order.sgstAmount).toFixed(2)}\n` : ''}${order.cgstAmount ? `CGST: ₹${Number(order.cgstAmount).toFixed(2)}\n` : ''}${order.deliveryCharges > 0 ? `Delivery Charges: ₹${Number(order.deliveryCharges).toFixed(2)}\n` : ''}*Total Amount: ₹${Number(order.total || 0).toFixed(2)}*
━━━━━━━━━━━━━━━━━━━━`;

    if (receiptUrl) {
      message += `\n\n📲 *View & Download Digital Receipt:*
${receiptUrl}

Tap the link above to view your full digital bill, download PDF receipt, and track live order progress!`;
    }

    message += `\n\n🙏 *Thank you for dining with us!*`;

    try {
      await Promise.race([
        sock.sendMessage(jid, { text: message }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("WhatsApp send timeout")), 8000))
      ]);
      console.log(`WhatsApp digital receipt sent to ${cleaned} via subadmin ${subAdminId}`);
    } catch (err) {
      console.error(`Failed to send WhatsApp digital receipt to ${cleaned}:`, err.message);
    }
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
