const mongoose = require("mongoose");

const albumSchema = new mongoose.Schema(
  {
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
    ownerEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    subtitle: {
      type: String,
      trim: true,
      default: "",
    },
    coverImageKey: {
      type: String,
      trim: true,
      default: null,
    },
    privacy: {
      type: String,
      trim: true,
      default: "Private",
    },
    entries: {
      type: Number,
      default: 0,
      min: 0,
    },
    memories: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Album", albumSchema);
