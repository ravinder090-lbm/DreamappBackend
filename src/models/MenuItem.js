import mongoose from "mongoose";

const menuItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    image: {
      type: String,
      trim: true,
      default: "",
    },
    available: {
      type: Boolean,
      default: true,
    },
    subAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubAdmin",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

menuItemSchema.index({ subAdmin: 1, createdAt: -1 });
menuItemSchema.index({ subAdmin: 1, available: 1, createdAt: -1 });

export const MenuItem = mongoose.model("MenuItem", menuItemSchema);
