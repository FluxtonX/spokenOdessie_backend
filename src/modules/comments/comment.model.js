const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    memoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Memory",
      required: true,
      index: true,
    },
    ownerFirebaseUid: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    ownerDisplayName: {
      type: String,
      trim: true,
      default: "",
    },
    ownerAvatarUrl: {
      type: String,
      trim: true,
      default: "",
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    parentCommentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
      index: true,
    },
    reactionsCount: {
      like: { type: Number, default: 0, min: 0 },
      love: { type: Number, default: 0, min: 0 },
      haha: { type: Number, default: 0, min: 0 },
      wow: { type: Number, default: 0, min: 0 },
      sad: { type: Number, default: 0, min: 0 },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Comment", commentSchema);
