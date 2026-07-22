const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const authRoutes = require("./modules/auth/auth.routes");
const albumRoutes = require("./modules/albums/album.routes");
const memoryRoutes = require("./modules/memories/memory.routes");
const userRoutes = require("./modules/user/user.routes");
const searchRoutes = require("./modules/search/search.routes");
const uploadRoutes = require("./modules/upload/upload.routes");

const app = express();

app.use(helmet());
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const defaultTrustedOrigins = [
  "http://localhost:3000",
  "https://spokenodyssey.com",
  "https://www.spokenodyssey.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server proxy from Vercel rewrites, Postman, curl)
      if (!origin) return callback(null, true);

      const allOrigins = [...allowedOrigins, ...defaultTrustedOrigins];
      const isAllowed =
        allOrigins.includes("*") ||
        allOrigins.includes(origin) ||
        origin.endsWith(".vercel.app");

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(null, true); // Allow origin dynamically for smooth cross-domain operations
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Request Logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/albums", albumRoutes);
app.use("/api/memories", memoryRoutes);
app.use("/api/users", userRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/upload", uploadRoutes);

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Spoken Odyssey backend is running",
  });
});

app.use((err, req, res, next) => {
  console.error("Unhandled App Error:", err.message);

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      message:
        "Uploaded file is too large. For now, keep memory media under 120MB.",
    });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Something went wrong on the server.",
  });
});

module.exports = app;
