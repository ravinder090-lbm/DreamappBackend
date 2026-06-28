import { DataTypes, Model } from "sequelize";
import { sequelize } from "../lib/db.js";
import { Category } from "./Category.js";
import { SubAdmin } from "./SubAdmin.js";

export class MenuItem extends Model {}

MenuItem.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    _id: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.id;
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    price: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Category,
        key: "id"
      }
    },
    description: {
      type: DataTypes.STRING,
      defaultValue: "",
    },
    image: {
      type: DataTypes.TEXT,
      defaultValue: "",
    },
    available: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    subAdminId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: SubAdmin,
        key: "id"
      }
    }
  },
  {
    sequelize,
    modelName: "MenuItem",
    indexes: [
      {
        fields: ["subAdminId", "createdAt"]
      },
      {
        fields: ["subAdminId", "available", "createdAt"]
      }
    ]
  }
);

MenuItem.belongsTo(Category, { foreignKey: "categoryId", as: "category" });
Category.hasMany(MenuItem, { foreignKey: "categoryId", as: "menuItems" });

MenuItem.belongsTo(SubAdmin, { foreignKey: "subAdminId", as: "subAdmin" });
SubAdmin.hasMany(MenuItem, { foreignKey: "subAdminId", as: "menuItems" });
