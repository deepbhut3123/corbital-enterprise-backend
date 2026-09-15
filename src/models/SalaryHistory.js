const mongoose = require("mongoose");

const salaryHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fixedSalary: {
      type: Number,
      required: true,
      min: 0,
    },
    variableSalary: {
      type: Number,
      required: true,
      min: 0,
    },
    effectiveFrom: {
      type: Date,
      required: true,
    },
    effectiveTo: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

salaryHistorySchema.index({ userId: 1, effectiveFrom: -1, createdAt: -1 });
salaryHistorySchema.index(
  { userId: 1 },
  {
    partialFilterExpression: { effectiveTo: null },
    unique: true,
  }
);

module.exports = mongoose.model("SalaryHistory", salaryHistorySchema);
