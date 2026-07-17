const jwt = require("jsonwebtoken");
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

      // Decode payload without verification to inspect issuer
      const decodedPayload = jwt.decode(token);

      if (!decodedPayload) {
        throw new Error("Invalid token format");
      }

      // Check if it is a Firebase ID Token
      if (decodedPayload.iss && decodedPayload.iss.includes("securetoken.google.com")) {
        // Verify with Firebase Admin
        const decodedFirebase = await admin.auth().verifyIdToken(token);
        const prisma = require("../config/prisma");
        
        let dbUser = null;
        if (decodedFirebase.email) {
          dbUser = await prisma.user.findUnique({
            where: { email: decodedFirebase.email.toLowerCase() }
          });
        }
        
        if (dbUser) {
          req.user = {
            id: dbUser.id,
            uid: dbUser.id,
            email: dbUser.email,
            role: dbUser.role || "USER"
          };
        } else {
          req.user = {
            id: decodedFirebase.uid,
            uid: decodedFirebase.uid,
            email: decodedFirebase.email,
            role: "USER"
          };
        }
      } else {
        // Verify locally using custom JWT
        const JWT_SECRET = process.env.JWT_SECRET || "spoken_odyssey_super_secret_key_12345";
        const decodedCustom = jwt.verify(token, JWT_SECRET);

        req.user = {
          id: decodedCustom.id,
          uid: decodedCustom.id,
          email: decodedCustom.email,
          role: decodedCustom.role,
        };
      }

      return next();
    } catch (error) {
      console.error("Auth Middleware Error:", error.message);
      return res.status(401).json({
        success: false,
        message: "Not authorized, token failed: " + error.message,
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
