const jwt = require("jsonwebtoken");
const admin = require("../config/firebase");

async function resolveFirebaseUser(decodedFirebase) {
  const prisma = require("../config/prisma");
  const email = decodedFirebase.email ? decodedFirebase.email.toLowerCase() : `${decodedFirebase.uid}@auth.local`;

  let dbUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: email },
        { googleId: decodedFirebase.uid }
      ]
    }
  });

  if (!dbUser) {
    try {
      dbUser = await prisma.user.create({
        data: {
          email: email,
          googleId: decodedFirebase.uid,
          displayName: decodedFirebase.name || (decodedFirebase.email ? decodedFirebase.email.split("@")[0] : "User"),
          photoURL: decodedFirebase.picture || null,
        },
      });
    } catch (createErr) {
      // If race condition created user concurrently, fetch again
      dbUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: email },
            { googleId: decodedFirebase.uid }
          ]
        }
      });
    }
  }

  return dbUser;
}

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decodedPayload = jwt.decode(token);

      if (!decodedPayload) {
        throw new Error("Invalid token format");
      }

      if (decodedPayload.iss && decodedPayload.iss.includes("securetoken.google.com")) {
        const decodedFirebase = await admin.auth().verifyIdToken(token);
        const dbUser = await resolveFirebaseUser(decodedFirebase);

        if (!dbUser || !dbUser.id) {
          throw new Error("Could not map Firebase user to PostgreSQL user");
        }

        req.user = {
          id: dbUser.id,
          uid: dbUser.id,
          email: dbUser.email,
          role: dbUser.role || "USER"
        };
      } else {
        const JWT_SECRET = process.env.JWT_SECRET || "spoken_odyssey_super_secret_key_12345";
        const decodedCustom = jwt.verify(token, JWT_SECRET);

        req.user = {
          id: decodedCustom.id,
          uid: decodedCustom.id,
          email: decodedCustom.email,
          role: decodedCustom.role || "USER",
        };
      }

      return next();
    } catch (error) {
      console.error("Auth Middleware Error:", error.message);
      return res.status(401).json({
        success: false,
        message: "Not authorized: " + error.message,
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, no token provided",
    });
  }
};

const optionalProtect = async (req, res, next) => {
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      const token = req.headers.authorization.split(" ")[1];
      const decodedPayload = jwt.decode(token);

      if (decodedPayload) {
        if (decodedPayload.iss && decodedPayload.iss.includes("securetoken.google.com")) {
          const decodedFirebase = await admin.auth().verifyIdToken(token);
          const dbUser = await resolveFirebaseUser(decodedFirebase);

          if (dbUser && dbUser.id) {
            req.user = {
              id: dbUser.id,
              uid: dbUser.id,
              email: dbUser.email,
              role: dbUser.role || "USER"
            };
          }
        } else {
          const JWT_SECRET = process.env.JWT_SECRET || "spoken_odyssey_super_secret_key_12345";
          const decodedCustom = jwt.verify(token, JWT_SECRET);

          req.user = {
            id: decodedCustom.id,
            uid: decodedCustom.id,
            email: decodedCustom.email,
            role: decodedCustom.role || "USER",
          };
        }
      }
    } catch (err) {
      console.warn("Optional protect token check failed, proceeding unauthenticated:", err.message);
    }
  }
  return next();
};

module.exports = { protect, optionalProtect };
