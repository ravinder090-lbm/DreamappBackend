import { Router } from "express";
import { Task } from "../models/Task.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const tasks = await Task.findAll({ order: [["createdAt", "DESC"]] });
    res.json(tasks);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const task = await Task.create({ title: req.body.title });
    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const [updatedCount] = await Task.update(req.body, {
      where: { id: req.params.id }
    });

    if (updatedCount === 0) {
      return res.status(404).json({ message: "Task not found" });
    }

    const task = await Task.findByPk(req.params.id);
    return res.json(task);
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const task = await Task.findByPk(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    await Task.destroy({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: "Something went wrong" });
});

export default router;
