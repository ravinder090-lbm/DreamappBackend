import { DataTypes, Model } from "sequelize";
import { sequelize } from "../lib/db.js";

export class SubscriptionPlan extends Model {}

SubscriptionPlan.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    price: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    tableLimit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    menuLimit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    bannerLimit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize,
    modelName: "SubscriptionPlan",
  }
);

import { SubAdmin } from "./SubAdmin.js";

SubscriptionPlan.hasMany(SubAdmin, { foreignKey: "subscriptionPlanId", as: "subAdmins" });
SubAdmin.belongsTo(SubscriptionPlan, { foreignKey: "subscriptionPlanId", as: "subscriptionPlan" });
