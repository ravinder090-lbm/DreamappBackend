import { DataTypes, Model } from "sequelize";
import { sequelize } from "../lib/db.js";
import { SubAdmin } from "./SubAdmin.js";

export class User extends Model {}

User.init(
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
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING,
      defaultValue: "",
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: "active",
    },
    address: {
      type: DataTypes.STRING,
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
    modelName: "User",
    indexes: [
      {
        fields: ["subAdminId", "phone"]
      },
      {
        fields: ["subAdminId", "createdAt"]
      }
    ]
  }
);

User.belongsTo(SubAdmin, { foreignKey: "subAdminId", as: "subAdmin" });
SubAdmin.hasMany(User, { foreignKey: "subAdminId", as: "users" });
