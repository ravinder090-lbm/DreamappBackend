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
      enum: ["Dine In", "Take Away", "Home Delivery"],
      default: "Dine In",
    },
    deliveryAddress: {
      type: String,
      trim: true,
      default: "",
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
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    sgstAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    cgstAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    deliveryCharges: {
      type: Number,
      min: 0,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["COD", "Online"],
      default: "COD",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
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

orderSchema.index({ subAdmin: 1, createdAt: -1 });
orderSchema.index({ customerPhone: 1, createdAt: -1 });

export const Order = mongoose.model("Order", orderSchema);
