import { DataTypes, Model } from "sequelize";
import bcrypt from "bcryptjs";
import { sequelize } from "../lib/db.js";

export class SubAdmin extends Model {
  async comparePassword(password) {
    return bcrypt.compare(password, this.password);
  }
}

SubAdmin.init(
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
    logo: {
      type: DataTypes.TEXT,
      defaultValue: "",
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    phone: {
      type: DataTypes.STRING,
      defaultValue: "",
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: "active",
    },
    role: {
      type: DataTypes.STRING,
      defaultValue: "subadmin",
    },
    whatsAppConnected: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    whatsAppNumber: {
      type: DataTypes.STRING,
      defaultValue: "",
    },
    address: {
      type: DataTypes.STRING,
      defaultValue: "",
    },
    deliveryRadius: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    lat: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    lng: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    themeColor: {
      type: DataTypes.STRING,
      defaultValue: "#1d6f56",
    },
    enableDineIn: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    enableTakeAway: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    enableDelivery: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    enableCOD: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    sgstPercent: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    cgstPercent: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    deliveryCharges: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "SubAdmin",
    hooks: {
      beforeSave: async (subadmin) => {
        if (subadmin.changed("password")) {
          subadmin.password = await bcrypt.hash(subadmin.password, 12);
        }
      },
    },
  }
);
