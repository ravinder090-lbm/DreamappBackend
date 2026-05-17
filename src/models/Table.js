import mongoose from "mongoose";

const tableSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
    },
    capacity: {
      type: Number,
      min: 1,
      default: 2,
    },
    status: {
      type: String,
      enum: ["available", "occupied", "inactive"],
      default: "available",
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

export const Table = mongoose.model("Table", tableSchema);
