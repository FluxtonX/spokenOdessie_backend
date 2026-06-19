const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    displayName: {
      type: String,
      trim: true,
    },
    photoURL: {
      type: String,
      trim: true,
    },
    photoKey: {
      type: String,
      trim: true,
    },
    bio: {
      type: String,
      trim: true,
      default: "",
    },
    profession: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    birthDate: {
      type: String,
      trim: true,
      default: "",
    },
    lifeMotto: {
      type: String,
      trim: true,
      default: "",
    },
    expertise: {
      type: [String],
      default: [],
    },
    defaultEntryPrivacy: {
      type: String,
      trim: true,
      default: "Private - Only by you",
    },
    profileVisibility: {
      type: String,
      trim: true,
      default: "Follower only",
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    profileCompleted: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    familyMembers: {
      type: [String],
      default: [],
    },
    recentInteractions: {
      type: [
        {
          tag: String,
          timestamp: { type: Date, default: Date.now },
          weight: { type: Number, default: 1 }
        }
      ],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
