const mongoose = require("mongoose");

const attendanceLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["check_in", "break_start", "break_end", "check_out"],
      required: true,
      trim: true,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    distanceMeters: {
      type: Number,
      default: null,
      min: 0,
    },
    address: {
      type: String,
      default: null,
      trim: true,
    },
    notes: {
      type: String,
      default: null,
      trim: true,
    },
    recordedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    _id: true,
    id: false,
  }
);

const attendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    attendanceDate: {
      type: Date,
      required: true,
      index: true,
    },
    totalMinutes: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    logs: {
      type: [attendanceLogSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

attendanceSchema.index({ userId: 1, attendanceDate: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
