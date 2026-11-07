import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { SubAdmin } from "../models/SubAdmin.js";
import { Order } from "../models/Order.js";
import { Table } from "../models/Table.js";
import { Category } from "../models/Category.js";
import { MenuItem } from "../models/MenuItem.js";
import { Banner } from "../models/Banner.js";
import { Booking } from "../models/Booking.js";
import { DeliveryAgent } from "../models/DeliveryAgent.js";
import { User } from "../models/User.js";
import { Task } from "../models/Task.js";
import { sequelize } from "../lib/db.js";

const router = Router();

router.use(requireAuth(["superadmin"]));

router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;

    const options = {
      order: [["createdAt", "DESC"]],
      include: ["subscriptionPlan"]
    };

    if (limit > 0) {
      options.limit = limit;
      options.offset = (page - 1) * limit;
    }

    const subAdmins = await SubAdmin.findAll(options);
    res.json(subAdmins);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const subAdmin = await SubAdmin.create(req.body);
    res.status(201).json(subAdmin);
  } catch (error) {
    next(error);
  }
});

router.post("/:id", async (req, res, next) => {
  try {
    const [updatedCount] = await SubAdmin.update(req.body, {
      where: { id: req.params.id }
    });

    if (updatedCount === 0) {
      return res.status(404).json({ message: "Subadmin not found" });
    }

    const subAdmin = await SubAdmin.findByPk(req.params.id, {
      include: ["subscriptionPlan"]
    });
    return res.json(subAdmin);
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const subAdmin = await SubAdmin.findByPk(req.params.id, { transaction });

    if (!subAdmin) {
      await transaction.rollback();
      return res.status(404).json({ message: "Subadmin not found" });
    }

    const subAdminId = req.params.id;

    // Delete all child records to satisfy PostgreSQL foreign key integrity
    await Order.destroy({ where: { subAdminId }, transaction });
    await Booking.destroy({ where: { subAdminId }, transaction });
    await MenuItem.destroy({ where: { subAdminId }, transaction });
    await Category.destroy({ where: { subAdminId }, transaction });
    await Table.destroy({ where: { subAdminId }, transaction });
    await DeliveryAgent.destroy({ where: { subAdminId }, transaction });
    await Banner.destroy({ where: { subAdminId }, transaction });
    await User.destroy({ where: { subAdminId }, transaction });
    await Task.destroy({ where: { subAdminId }, transaction }).catch(() => {});

    await SubAdmin.destroy({ where: { id: subAdminId }, transaction });

    await transaction.commit();
    return res.status(204).send();
  } catch (error) {
    await transaction.rollback();
    return next(error);
  }
});

export default router;
