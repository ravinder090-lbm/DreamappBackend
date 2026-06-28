import { Router } from "express";
import { Op } from "sequelize";
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
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      ordersCount,
      usersCount,
      tablesCount,
      categoriesCount,
      menuItemsCount,
      ordersInLast7Days,
      allOrdersStatus
    ] = await Promise.all([
      Order.count({ where: { subAdminId: req.user.id } }),
      User.count({ where: { subAdminId: req.user.id } }),
      Table.count({ where: { subAdminId: req.user.id } }),
      Category.count({ where: { subAdminId: req.user.id } }),
      MenuItem.count({ where: { subAdminId: req.user.id } }),

      Order.findAll({
        where: {
          subAdminId: req.user.id,
          createdAt: { [Op.gte]: sevenDaysAgo }
        },
        attributes: ["total", "createdAt"]
      }),

      Order.findAll({
        where: { subAdminId: req.user.id },
        attributes: ["status"]
      })
    ]);

    // Aggregate trends in JS
    const orderTrendRawMap = {};
    ordersInLast7Days.forEach((ord) => {
      const dateStr = new Date(ord.createdAt).toISOString().split("T")[0];
      if (!orderTrendRawMap[dateStr]) {
        orderTrendRawMap[dateStr] = { count: 0, revenue: 0 };
      }
      orderTrendRawMap[dateStr].count += 1;
      orderTrendRawMap[dateStr].revenue += ord.total;
    });

    const orderTrend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" });

      const match = orderTrendRawMap[dateStr];
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
    allOrdersStatus.forEach((ord) => {
      if (ord.status && statusDistribution[ord.status] !== undefined) {
        statusDistribution[ord.status]++;
      }
    });

    res.json({
      orders: ordersCount,
      users: usersCount,
      tables: tablesCount,
      categories: categoriesCount,
      menuItems: menuItemsCount,
      orderTrend,
      statusDistribution
    });
  } catch (error) {
    next(error);
  }
});

export default router;
