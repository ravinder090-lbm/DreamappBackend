import { DataTypes, Model } from "sequelize";
import { sequelize } from "../lib/db.js";
import { SubAdmin } from "./SubAdmin.js";

export class Banner extends Model {}

Banner.init(
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
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      defaultValue: "",
    },
    image: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: "active",
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
    modelName: "Banner",
    indexes: [
      {
        fields: ["subAdminId", "createdAt"]
      },
      {
        fields: ["subAdminId", "status", "createdAt"]
      }
    ]
  }
);

Banner.belongsTo(SubAdmin, { foreignKey: "subAdminId", as: "subAdmin" });
SubAdmin.hasMany(Banner, { foreignKey: "subAdminId", as: "banners" });
