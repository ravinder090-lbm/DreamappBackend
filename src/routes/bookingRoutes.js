import express from "express";
import { Booking } from "../models/Booking.js";
import { Table } from "../models/Table.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth(["subadmin"]));

// Get all bookings
router.get("/", async (req, res) => {
  try {
    const subAdminId = req.user.id;
    const bookings = await Booking.findAll({
      where: { subAdminId },
      order: [
        ['date', 'ASC'],
        ['time', 'ASC']
      ],
      include: [
        { model: Table, as: "table" }
      ]
    });
    res.json(bookings);
  } catch (error) {
    console.error("Fetch bookings error:", error);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// Update a booking
router.put("/:id", async (req, res) => {
  try {
    const subAdminId = req.user.id;
    const { id } = req.params;
    const { status, tableId, tableName } = req.body;

    const booking = await Booking.findOne({ where: { id, subAdminId } });
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (status) booking.status = status;
    if (tableId !== undefined) {
      booking.tableId = tableId || null;
      booking.tableName = tableName || "";
    }

    await booking.save();
    
    // Fetch with included table
    const updatedBooking = await Booking.findOne({
      where: { id },
      include: [{ model: Table, as: "table" }]
    });

    res.json({ message: "Booking updated", booking: updatedBooking });
  } catch (error) {
    console.error("Update booking error:", error);
    res.status(500).json({ error: "Failed to update booking" });
  }
});

// Create booking manually (optional)
router.post("/", async (req, res) => {
  try {
    const subAdminId = req.user.id;
    const { customerName, customerPhone, date, time, partySize, tableId, tableName, specialRequests } = req.body;

    const bookingNumber = `BK-${Math.floor(10000 + Math.random() * 90000)}`;

    const newBooking = await Booking.create({
      bookingNumber,
      customerName,
      customerPhone,
      date,
      time,
      partySize: parseInt(partySize, 10) || 1,
      tableId: tableId || null,
      tableName: tableName || "",
      specialRequests: specialRequests || "",
      subAdminId,
      status: "confirmed" // Manual bookings are auto-confirmed usually
    });

    res.json(newBooking);
  } catch (error) {
    console.error("Create booking error:", error);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

export default router;
