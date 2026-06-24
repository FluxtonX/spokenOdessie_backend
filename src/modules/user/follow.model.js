const mongoose = require("mongoose");

const followSchema = new mongoose.Schema(
  {
    followerId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    followingId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure uniqueness (can only follow a user once)
followSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

module.exports = mongoose.model("Follow", followSchema);
