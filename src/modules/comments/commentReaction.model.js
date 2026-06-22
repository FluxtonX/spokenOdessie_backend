const mongoose = require("mongoose");

const commentReactionSchema = new mongoose.Schema(
  {
    commentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
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
      enum: ["like", "love", "haha", "wow", "sad"],
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index: one reaction per user per comment
commentReactionSchema.index({ commentId: 1, userFirebaseUid: 1 }, { unique: true });

module.exports = mongoose.model("CommentReaction", commentReactionSchema);
