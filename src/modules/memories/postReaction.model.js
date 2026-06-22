const mongoose = require("mongoose");

const postReactionSchema = new mongoose.Schema(
  {
    memoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Memory",
      required: true,
      index: true,
    },
    userFirebaseUid: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["heart", "like", "wow", "haha", "angry"],
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index: one reaction per user per memory
postReactionSchema.index({ memoryId: 1, userFirebaseUid: 1 }, { unique: true });

module.exports = mongoose.model("PostReaction", postReactionSchema);
