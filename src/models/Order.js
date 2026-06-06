import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    image: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      trim: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerPhone: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "preparing", "completed", "cancelled"],
      default: "pending",
    },
    orderType: {
      type: String,
      enum: ["Dine In", "Take Away"],
      default: "Dine In",
    },
    table: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Table",
      default: null,
    },
    tableName: {
      type: String,
      trim: true,
      default: "",
    },
    items: {
      type: [orderItemSchema],
      default: [],
    },
    total: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
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

export const Order = mongoose.model("Order", orderSchema);
