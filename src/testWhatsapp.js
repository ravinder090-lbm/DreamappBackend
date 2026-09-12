import "dotenv/config";
import { whatsappManager } from "./lib/whatsappManager.js";
import { sequelize } from "./lib/db.js";

async function testWhatsapp() {
  try {
    await sequelize.authenticate();
    console.log("DB connected.");
    console.log("Attempting to connect WhatsApp session...");
    await whatsappManager.connectSession("test_subadmin");
    console.log("Connect session method returned.");
    
    // Wait a bit for QR code
    let attempts = 0;
    while (attempts < 20) {
      const status = whatsappManager.getStatus("test_subadmin");
      console.log("Status:", status);
      if (status.qr) {
        console.log("QR Code received successfully!");
        process.exit(0);
      }
      await new Promise(r => setTimeout(r, 1000));
      attempts++;
    }
    console.log("Timeout waiting for QR code.");
    process.exit(1);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

testWhatsapp();
