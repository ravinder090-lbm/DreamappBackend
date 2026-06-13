import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { Category } from "../models/Category.js";
import { MenuItem } from "../models/MenuItem.js";
import { Banner } from "../models/Banner.js";

const router = Router();

router.use(requireAuth(["subadmin"]));

router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 0;
    const type = req.query.type; // 'categories', 'menu-items', or 'banners'

    if (type) {
      let query;
      if (type === "categories") {
        query = Category.find({ subAdmin: req.user.id }).sort({ createdAt: -1 });
      } else if (type === "menu-items") {
        query = MenuItem.find({ subAdmin: req.user.id }).populate("category").sort({ createdAt: -1 });
      } else if (type === "banners") {
        query = Banner.find({ subAdmin: req.user.id }).sort({ createdAt: -1 });
      } else {
        return res.status(400).json({ message: "Invalid type parameter" });
      }

      if (limit > 0) {
        query = query.skip((page - 1) * limit).limit(limit);
      }

      const items = await query;
      return res.json({ [type]: items });
    }

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
    if (req.io) {
      req.io.to(req.user.id.toString()).emit("catalog_updated");
    }
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

    if (req.io) {
      req.io.to(req.user.id.toString()).emit("catalog_updated");
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

    if (req.io) {
      req.io.to(req.user.id.toString()).emit("catalog_updated");
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.post("/menu-items", async (req, res, next) => {
  try {
    const menuItem = await MenuItem.create({ ...req.body, subAdmin: req.user.id });
    const populatedMenuItem = await menuItem.populate("category");
    if (req.io) {
      req.io.to(req.user.id.toString()).emit("catalog_updated");
    }
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

    if (req.io) {
      req.io.to(req.user.id.toString()).emit("catalog_updated");
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

    if (req.io) {
      req.io.to(req.user.id.toString()).emit("catalog_updated");
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.post("/banners", async (req, res, next) => {
  try {
    const banner = await Banner.create({ ...req.body, subAdmin: req.user.id });
    if (req.io) {
      req.io.to(req.user.id.toString()).emit("catalog_updated");
    }
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

    if (req.io) {
      req.io.to(req.user.id.toString()).emit("catalog_updated");
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

    if (req.io) {
      req.io.to(req.user.id.toString()).emit("catalog_updated");
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
