import { DataTypes, Model } from "sequelize";
import { sequelize } from "../lib/db.js";
import { Table } from "./Table.js";
import { SubAdmin } from "./SubAdmin.js";

export class Order extends Model {}

Order.init(
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
    orderNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    customerName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    customerPhone: {
      type: DataTypes.STRING,
      defaultValue: "",
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: "pending",
    },
    orderType: {
      type: DataTypes.STRING,
      defaultValue: "Dine In",
    },
    deliveryAddress: {
      type: DataTypes.STRING,
      defaultValue: "",
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
    },
    items: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    subtotal: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    sgstAmount: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    cgstAmount: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    deliveryCharges: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    total: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    paymentMethod: {
      type: DataTypes.STRING,
      defaultValue: "COD",
    },
    paymentStatus: {
      type: DataTypes.STRING,
      defaultValue: "pending",
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
    modelName: "Order",
    indexes: [
      {
        fields: ["subAdminId", "createdAt"]
      },
      {
        fields: ["customerPhone", "createdAt"]
      }
    ]
  }
);

Order.belongsTo(Table, { foreignKey: "tableId", as: "table" });
Table.hasMany(Order, { foreignKey: "tableId", as: "orders" });

Order.belongsTo(SubAdmin, { foreignKey: "subAdminId", as: "subAdmin" });
SubAdmin.hasMany(Order, { foreignKey: "subAdminId", as: "orders" });
