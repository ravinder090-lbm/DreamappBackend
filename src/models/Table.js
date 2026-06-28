import { DataTypes, Model } from "sequelize";
import { sequelize } from "../lib/db.js";
import { SubAdmin } from "./SubAdmin.js";

export class Table extends Model {}

Table.init(
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
    code: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    capacity: {
      type: DataTypes.INTEGER,
      defaultValue: 2,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: "available",
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
    modelName: "Table",
    indexes: [
      {
        fields: ["subAdminId", "createdAt"]
      }
    ]
  }
);

Table.belongsTo(SubAdmin, { foreignKey: "subAdminId", as: "subAdmin" });
SubAdmin.hasMany(Table, { foreignKey: "subAdminId", as: "tables" });
