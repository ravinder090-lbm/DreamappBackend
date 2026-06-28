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
      let items;
      const options = {
        where: { subAdminId: req.user.id },
        order: [["createdAt", "DESC"]]
      };

      if (limit > 0) {
        options.limit = limit;
        options.offset = (page - 1) * limit;
      }

      if (type === "categories") {
        items = await Category.findAll(options);
      } else if (type === "menu-items") {
        options.include = [{ model: Category, as: "category" }];
        items = await MenuItem.findAll(options);
      } else if (type === "banners") {
        items = await Banner.findAll(options);
      } else {
        return res.status(400).json({ message: "Invalid type parameter" });
      }

      return res.json({ [type]: items });
    }

    const [categories, menuItems, banners] = await Promise.all([
      Category.findAll({ where: { subAdminId: req.user.id }, order: [["createdAt", "DESC"]] }),
      MenuItem.findAll({ where: { subAdminId: req.user.id }, include: [{ model: Category, as: "category" }], order: [["createdAt", "DESC"]] }),
      Banner.findAll({ where: { subAdminId: req.user.id }, order: [["createdAt", "DESC"]] }),
    ]);

    res.json({ categories, menuItems, banners });
  } catch (error) {
    next(error);
  }
});

router.post("/categories", async (req, res, next) => {
  try {
    const category = await Category.create({ ...req.body, subAdminId: req.user.id });
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
    const [updatedCount] = await Category.update(req.body, {
      where: { id: req.params.id, subAdminId: req.user.id }
    });

    if (updatedCount === 0) {
      return res.status(404).json({ message: "Category not found" });
    }

    const category = await Category.findOne({ where: { id: req.params.id, subAdminId: req.user.id } });

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
    const category = await Category.findOne({ where: { id: req.params.id, subAdminId: req.user.id } });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const menuItems = await MenuItem.findAll({
      where: { categoryId: req.params.id, subAdminId: req.user.id },
      order: [["createdAt", "DESC"]]
    });

    return res.json({ category, menuItems });
  } catch (error) {
    return next(error);
  }
});

router.delete("/categories/:id", async (req, res, next) => {
  try {
    const category = await Category.findOne({ where: { id: req.params.id, subAdminId: req.user.id } });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    await Category.destroy({ where: { id: req.params.id, subAdminId: req.user.id } });
    await MenuItem.destroy({ where: { categoryId: req.params.id, subAdminId: req.user.id } });

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
    if (req.body.category) {
      req.body.categoryId = req.body.category;
    }
    const menuItem = await MenuItem.create({ ...req.body, subAdminId: req.user.id });
    const populatedMenuItem = await MenuItem.findOne({
      where: { id: menuItem.id },
      include: [{ model: Category, as: "category" }]
    });
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
    const menuItem = await MenuItem.findOne({
      where: { id: req.params.id, subAdminId: req.user.id },
      include: [{ model: Category, as: "category" }]
    });

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
    if (req.body.category) {
      req.body.categoryId = req.body.category;
    }
    const [updatedCount] = await MenuItem.update(req.body, {
      where: { id: req.params.id, subAdminId: req.user.id }
    });

    if (updatedCount === 0) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    const menuItem = await MenuItem.findOne({
      where: { id: req.params.id, subAdminId: req.user.id },
      include: [{ model: Category, as: "category" }]
    });

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
    const menuItem = await MenuItem.findOne({ where: { id: req.params.id, subAdminId: req.user.id } });

    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    await MenuItem.destroy({ where: { id: req.params.id, subAdminId: req.user.id } });

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
    const banner = await Banner.create({ ...req.body, subAdminId: req.user.id });
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
    const banner = await Banner.findOne({ where: { id: req.params.id, subAdminId: req.user.id } });

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
    const [updatedCount] = await Banner.update(req.body, {
      where: { id: req.params.id, subAdminId: req.user.id }
    });

    if (updatedCount === 0) {
      return res.status(404).json({ message: "Banner not found" });
    }

    const banner = await Banner.findOne({ where: { id: req.params.id, subAdminId: req.user.id } });

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
    const banner = await Banner.findOne({ where: { id: req.params.id, subAdminId: req.user.id } });

    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    await Banner.destroy({ where: { id: req.params.id, subAdminId: req.user.id } });

    if (req.io) {
      req.io.to(req.user.id.toString()).emit("catalog_updated");
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
