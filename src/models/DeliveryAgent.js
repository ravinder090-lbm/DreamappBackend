import { DataTypes, Model } from "sequelize";
import { sequelize } from "../lib/db.js";
import { SubAdmin } from "./SubAdmin.js";

export class DeliveryAgent extends Model {}

DeliveryAgent.init(
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
    phone: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    pin: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    vehicleDetails: {
      type: DataTypes.STRING,
      defaultValue: "",
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: "available", // available, offline, on-delivery
    },
    lastLat: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    lastLng: {
      type: DataTypes.FLOAT,
      allowNull: true,
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
    modelName: "DeliveryAgent",
    indexes: [
      {
        fields: ["subAdminId", "phone"]
      }
    ]
  }
);

DeliveryAgent.belongsTo(SubAdmin, { foreignKey: "subAdminId", as: "subAdmin" });
SubAdmin.hasMany(DeliveryAgent, { foreignKey: "subAdminId", as: "deliveryAgents" });
