import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const subAdminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    logo: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    role: {
      type: String,
      default: "subadmin",
      immutable: true,
    },
    whatsAppConnected: {
      type: Boolean,
      default: false,
    },
    whatsAppNumber: {
      type: String,
      default: "",
    },
    address: {
      type: String,
      default: "",
    },
    deliveryRadius: {
      type: Number,
      default: 0,
    },
    lat: {
      type: Number,
      default: 0,
    },
    lng: {
      type: Number,
      default: 0,
    },
    themeColor: {
      type: String,
      default: "#1d6f56",
    },
    enableDineIn: {
      type: Boolean,
      default: true,
    },
    enableTakeAway: {
      type: Boolean,
      default: true,
    },
    enableDelivery: {
      type: Boolean,
      default: true,
    },
    enableCOD: {
      type: Boolean,
      default: true,
    },
    sgstPercent: {
      type: Number,
      default: 0,
      min: 0,
    },
    cgstPercent: {
      type: Number,
      default: 0,
      min: 0,
    },
    deliveryCharges: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

subAdminSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) {
    return next();
  }

  this.password = await bcrypt.hash(this.password, 12);
  return next();
});

subAdminSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.password);
};

export const SubAdmin = mongoose.model("SubAdmin", subAdminSchema);
