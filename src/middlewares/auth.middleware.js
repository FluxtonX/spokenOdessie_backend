const admin = require("../config/firebase");

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1];

      // Verify token
      if (!admin.apps.length) {
        throw new Error("Firebase Admin not initialized");
      }
      const decodedToken = await admin.auth().verifyIdToken(token);

      // Attach user info to request
      req.user = decodedToken;

      next();
    } catch (error) {
      console.error("Auth Middleware Error:", error.message);
      return res.status(401).json({
        success: false,
        message: "Not authorized, token failed",
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, no token",
    });
  }
};

module.exports = { protect };
