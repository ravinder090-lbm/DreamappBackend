import { DataTypes, Model } from "sequelize";
import { sequelize } from "../lib/db.js";
import { SubAdmin } from "./SubAdmin.js";
import { Table } from "./Table.js";

export class Booking extends Model {}

Booking.init(
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
    bookingNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    customerName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    customerPhone: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    date: {
      type: DataTypes.DATEONLY, // YYYY-MM-DD
      allowNull: false,
    },
    time: {
      type: DataTypes.STRING, // HH:mm
      allowNull: false,
    },
    partySize: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: "pending", // pending, confirmed, cancelled, completed
    },
    specialRequests: {
      type: DataTypes.TEXT,
      defaultValue: "",
    },
    items: {
      type: DataTypes.JSONB, // Pre-ordered items
      defaultValue: [],
    },
    subtotal: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    total: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    subAdminId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: SubAdmin,
        key: "id"
      }
    },
    tableId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: Table,
        key: "id"
      }
    },
    tableName: {
      type: DataTypes.STRING,
      defaultValue: "",
    }
  },
  {
    sequelize,
    modelName: "Booking",
  }
);

Booking.belongsTo(SubAdmin, { foreignKey: "subAdminId", as: "subAdmin" });
SubAdmin.hasMany(Booking, { foreignKey: "subAdminId", as: "bookings" });

Booking.belongsTo(Table, { foreignKey: "tableId", as: "table" });
Table.hasMany(Booking, { foreignKey: "tableId", as: "bookings" });
