const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const authRoutes = require("./modules/auth/auth.routes");
const albumRoutes = require("./modules/albums/album.routes");
const memoryRoutes = require("./modules/memories/memory.routes");
const userRoutes = require("./modules/user/user.routes");
const searchRoutes = require("./modules/search/search.routes");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ limit: "500mb", extended: true }));

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
