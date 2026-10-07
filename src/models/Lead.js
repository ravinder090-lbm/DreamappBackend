import { DataTypes, Model } from "sequelize";
import { sequelize } from "../lib/db.js";

export class Lead extends Model {}

Lead.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    source: {
      type: DataTypes.STRING,
      defaultValue: "demo_access",
    },
  },
  {
    sequelize,
    modelName: "Lead",
  }
);
