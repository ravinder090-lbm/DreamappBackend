import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import { Table } from "../models/Table.js";
import { Category } from "../models/Category.js";
import { MenuItem } from "../models/MenuItem.js";

const router = Router();

router.use(requireAuth(["subadmin"]));

router.get("/", async (req, res, next) => {
  try {
    // Calculate 7 days ago (start of day)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const subAdminId = new mongoose.Types.ObjectId(req.user.id);

    const [
      orders,
      users,
      tables,
      categories,
      menuItems,
      orderTrendRaw,
      statusDistributionRaw
    ] = await Promise.all([
      Order.countDocuments({ subAdmin: req.user.id }),
      User.countDocuments({ subAdmin: req.user.id }),
      Table.countDocuments({ subAdmin: req.user.id }),
      Category.countDocuments({ subAdmin: req.user.id }),
      MenuItem.countDocuments({ subAdmin: req.user.id }),

      // Aggregate order trends (counts & revenue) for last 7 days
      Order.aggregate([
        {
          $match: {
            subAdmin: subAdminId,
            createdAt: { $gte: sevenDaysAgo }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
            revenue: { $sum: "$total" }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // Aggregate status distribution
      Order.aggregate([
        {
          $match: {
            subAdmin: subAdminId
          }
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Pre-populate last 7 days (including today) in correct order
    const orderTrend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" });

      const match = orderTrendRaw.find((item) => item._id === dateStr);
      orderTrend.push({
        date: dateStr,
        label: dayLabel,
        count: match ? match.count : 0,
        revenue: match ? match.revenue : 0
      });
    }

    // Map status distribution counts
    const statusDistribution = {
      pending: 0,
      preparing: 0,
      completed: 0,
      cancelled: 0
    };
    statusDistributionRaw.forEach((item) => {
      if (item._id && statusDistribution[item._id] !== undefined) {
        statusDistribution[item._id] = item.count;
      }
    });

    res.json({
      orders,
      users,
      tables,
      categories,
      menuItems,
      orderTrend,
      statusDistribution
    });
  } catch (error) {
    next(error);
  }
});

export default router;
