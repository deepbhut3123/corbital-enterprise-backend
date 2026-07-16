const mongoose = require("mongoose");

const valueEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    entryDate: {
      type: Date,
      required: true,
    },
    purchaseAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    sellAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

valueEntrySchema.index({
  entryDate: -1,
  userId: 1,
});

module.exports = mongoose.model("ValueEntry", valueEntrySchema);
