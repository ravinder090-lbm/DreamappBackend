import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { Category } from "../models/Category.js";
import { MenuItem } from "../models/MenuItem.js";
import { Banner } from "../models/Banner.js";

const router = Router();

router.use(requireAuth(["subadmin"]));

router.get("/", async (req, res, next) => {
  try {
    const [categories, menuItems, banners] = await Promise.all([
      Category.find({ subAdmin: req.user.id }).sort({ createdAt: -1 }),
      MenuItem.find({ subAdmin: req.user.id }).populate("category").sort({ createdAt: -1 }),
      Banner.find({ subAdmin: req.user.id }).sort({ createdAt: -1 }),
    ]);

    res.json({ categories, menuItems, banners });
  } catch (error) {
    next(error);
  }
});

router.post("/categories", async (req, res, next) => {
  try {
    const category = await Category.create({ ...req.body, subAdmin: req.user.id });
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

router.post("/categories/:id", async (req, res, next) => {
  try {
    const category = await Category.findOneAndUpdate(
      { _id: req.params.id, subAdmin: req.user.id },
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    return res.json(category);
  } catch (error) {
    return next(error);
  }
});

router.get("/categories/:id", async (req, res, next) => {
  try {
    const category = await Category.findOne({ _id: req.params.id, subAdmin: req.user.id });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const menuItems = await MenuItem.find({ category: req.params.id, subAdmin: req.user.id }).sort({ createdAt: -1 });

    return res.json({ category, menuItems });
  } catch (error) {
    return next(error);
  }
});

router.delete("/categories/:id", async (req, res, next) => {
  try {
    const category = await Category.findOneAndDelete({ _id: req.params.id, subAdmin: req.user.id });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    await MenuItem.deleteMany({ category: req.params.id, subAdmin: req.user.id });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.post("/menu-items", async (req, res, next) => {
  try {
    const menuItem = await MenuItem.create({ ...req.body, subAdmin: req.user.id });
    const populatedMenuItem = await menuItem.populate("category");
    res.status(201).json(populatedMenuItem);
  } catch (error) {
    next(error);
  }
});

router.get("/menu-items/:id", async (req, res, next) => {
  try {
    const menuItem = await MenuItem.findOne({ _id: req.params.id, subAdmin: req.user.id })
      .populate("category");

    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    return res.json(menuItem);
  } catch (error) {
    return next(error);
  }
});

router.post("/menu-items/:id", async (req, res, next) => {
  try {
    const menuItem = await MenuItem.findOneAndUpdate(
      { _id: req.params.id, subAdmin: req.user.id },
      req.body,
      {
        new: true,
        runValidators: true,
      }
    ).populate("category");

    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    return res.json(menuItem);
  } catch (error) {
    return next(error);
  }
});

router.delete("/menu-items/:id", async (req, res, next) => {
  try {
    const menuItem = await MenuItem.findOneAndDelete({ _id: req.params.id, subAdmin: req.user.id });

    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.post("/banners", async (req, res, next) => {
  try {
    const banner = await Banner.create({ ...req.body, subAdmin: req.user.id });
    res.status(201).json(banner);
  } catch (error) {
    next(error);
  }
});

router.get("/banners/:id", async (req, res, next) => {
  try {
    const banner = await Banner.findOne({ _id: req.params.id, subAdmin: req.user.id });

    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    return res.json(banner);
  } catch (error) {
    return next(error);
  }
});

router.post("/banners/:id", async (req, res, next) => {
  try {
    const banner = await Banner.findOneAndUpdate(
      { _id: req.params.id, subAdmin: req.user.id },
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    return res.json(banner);
  } catch (error) {
    return next(error);
  }
});

router.delete("/banners/:id", async (req, res, next) => {
  try {
    const banner = await Banner.findOneAndDelete({ _id: req.params.id, subAdmin: req.user.id });

    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
