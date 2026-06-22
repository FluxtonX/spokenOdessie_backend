const mongoose = require("mongoose");

const memorySchema = new mongoose.Schema(
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
    description: {
      type: String,
      trim: true,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
    },
    mood: {
      type: String,
      trim: true,
      default: "",
    },
    privacy: {
      type: String,
      trim: true,
      default: "Private",
    },
    type: {
      type: String,
      trim: true,
      default: "Text",
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
    albumId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Album",
      default: null,
    },
    albumTitle: {
      type: String,
      trim: true,
      default: "",
    },
    occurredAt: {
      type: Date,
      default: Date.now,
    },
    mediaKey: {
      type: String,
      trim: true,
      default: null,
    },
    thumbnailKey: {
      type: String,
      trim: true,
      default: null,
    },
    mediaOriginalName: {
      type: String,
      trim: true,
      default: "",
    },
    mediaMimeType: {
      type: String,
      trim: true,
      default: "",
    },
    mediaList: {
      type: [
        {
          mediaKey: String,
          thumbnailKey: String,
          mediaOriginalName: String,
          mediaMimeType: String,
        }
      ],
      default: [],
    },
    likes: {
      type: Number,
      default: 0,
      min: 0,
    },
    comments: {
      type: Number,
      default: 0,
      min: 0,
    },
    shares: {
      type: Number,
      default: 0,
      min: 0,
    },
    color: {
      type: String,
      trim: true,
      default: "",
    },
    backgroundId: {
      type: String,
      trim: true,
      default: "none",
    },
    fontId: {
      type: String,
      trim: true,
      default: "default",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Memory", memorySchema);
