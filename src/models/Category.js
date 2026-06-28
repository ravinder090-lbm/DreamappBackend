import { DataTypes, Model } from "sequelize";
import { sequelize } from "../lib/db.js";
import { SubAdmin } from "./SubAdmin.js";

export class Category extends Model {}

Category.init(
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
    description: {
      type: DataTypes.STRING,
      defaultValue: "",
    },
    image: {
      type: DataTypes.TEXT,
      defaultValue: "",
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
    modelName: "Category",
    indexes: [
      {
        fields: ["subAdminId", "createdAt"]
      }
    ]
  }
);

Category.belongsTo(SubAdmin, { foreignKey: "subAdminId", as: "subAdmin" });
SubAdmin.hasMany(Category, { foreignKey: "subAdminId", as: "categories" });
