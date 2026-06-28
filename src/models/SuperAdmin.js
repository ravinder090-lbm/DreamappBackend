import { DataTypes, Model } from "sequelize";
import bcrypt from "bcryptjs";
import { sequelize } from "../lib/db.js";

export class SuperAdmin extends Model {
  async comparePassword(password) {
    return bcrypt.compare(password, this.password);
  }
}

SuperAdmin.init(
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
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING,
      defaultValue: "superadmin",
    },
  },
  {
    sequelize,
    modelName: "SuperAdmin",
    hooks: {
      beforeSave: async (superadmin) => {
        if (superadmin.changed("password")) {
          superadmin.password = await bcrypt.hash(superadmin.password, 12);
        }
      },
    },
  }
);
