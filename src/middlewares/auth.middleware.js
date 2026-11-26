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
        const decodedFirebase = await admin.auth().verifyIdToken(token, true);
        let dbUser = await resolveFirebaseUser(decodedFirebase);

        if (!dbUser || !dbUser.id) {
          throw new Error("Could not map Firebase user to PostgreSQL user");
        }
        const restrictionService = require("../services/adminAccountRestrictions.service");
        dbUser = await restrictionService.refreshExpiredRestriction(dbUser);
        const accountRestriction = restrictionService.getEffectiveRestriction(dbUser);
        if (["TEMPORARY_SUSPENDED", "PERMANENTLY_SUSPENDED"].includes(accountRestriction)) {
          return res.status(403).json({ success: false, code: "ACCOUNT_DISABLED", message: "This account is currently disabled." });
        }

        const sessionJti = decodedFirebase.jti || decodedFirebase.sub || `fb-${dbUser.id}`;
        const { registerUserSession } = require("../services/session.service");
        registerUserSession({ userId: dbUser.id, sessionJti, req }).catch(() => {});

        req.user = {
          id: dbUser.id,
          uid: dbUser.id,
          email: dbUser.email,
          role: dbUser.role || "USER",
          sessionJti: sessionJti,
          accountRestriction,
          restrictionReason: dbUser.adminRestrictionReason || null,
        };
      } else {
        const JWT_SECRET = process.env.JWT_SECRET || "spoken_odyssey_super_secret_key_12345";
        const decodedCustom = jwt.verify(token, JWT_SECRET);

        if (decodedCustom.mfaPending || decodedCustom.type === "MFA_PENDING") {
          return res.status(401).json({
            success: false,
            code: "MFA_PENDING",
            message: "Multi-Factor Authentication required before accessing protected resources.",
          });
        }

        if (decodedCustom.jti) {
          const { validateSession } = require("../services/session.service");
          const isValidSession = await validateSession(decodedCustom.jti);
          if (!isValidSession) {
            return res.status(401).json({
              success: false,
              code: "SESSION_REVOKED",
              message: "This session has been revoked. Please sign in again.",
            });
          }
        }

        if (decodedCustom.id) {
          const prisma = require("../config/prisma");
          let account = await prisma.user.findUnique({ where: { id: decodedCustom.id } });
          if (account) {
            const restrictionService = require("../services/adminAccountRestrictions.service");
            account = await restrictionService.refreshExpiredRestriction(account);
            const accountRestriction = restrictionService.getEffectiveRestriction(account);
            if (["TEMPORARY_SUSPENDED", "PERMANENTLY_SUSPENDED"].includes(accountRestriction)) {
              return res.status(403).json({ success: false, code: "ACCOUNT_DISABLED", message: "This account is currently disabled." });
            }
            req.user = {
              id: decodedCustom.id,
              uid: decodedCustom.id,
              email: decodedCustom.email,
              role: decodedCustom.role || "USER",
              sessionJti: decodedCustom.jti,
              accountRestriction,
              restrictionReason: account.adminRestrictionReason || null,
            };
          }
          if (account && account.adminRestriction === "NONE" && account.adminRestrictionUpdatedAt && decodedCustom.iat && decodedCustom.iat * 1000 < new Date(account.adminRestrictionUpdatedAt).getTime() - 1000) {
            return res.status(401).json({ success: false, code: "SESSION_REVOKED", message: "Your account access has changed. Please sign in again." });
          }
        }

        if (!decodedCustom.id) req.user = {
          id: decodedCustom.id,
          uid: decodedCustom.id,
          email: decodedCustom.email,
          role: decodedCustom.role || "USER",
          sessionJti: decodedCustom.jti,
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
          const decodedFirebase = await admin.auth().verifyIdToken(token, true);
          let dbUser = await resolveFirebaseUser(decodedFirebase);

          if (dbUser && dbUser.id) {
            const restrictionService = require("../services/adminAccountRestrictions.service");
            dbUser = await restrictionService.refreshExpiredRestriction(dbUser);
            const accountRestriction = restrictionService.getEffectiveRestriction(dbUser);
            if (["TEMPORARY_SUSPENDED", "PERMANENTLY_SUSPENDED"].includes(accountRestriction)) {
              return res.status(403).json({ success: false, code: "ACCOUNT_DISABLED", message: "This account is currently disabled." });
            }
            req.user = {
              id: dbUser.id,
              uid: dbUser.id,
              email: dbUser.email,
              role: dbUser.role || "USER",
              accountRestriction,
            };
          }
        } else {
          const JWT_SECRET = process.env.JWT_SECRET || "spoken_odyssey_super_secret_key_12345";
          const decodedCustom = jwt.verify(token, JWT_SECRET);
          if (decodedCustom.id) {
            const prisma = require("../config/prisma");
            let dbUser = await prisma.user.findUnique({ where: { id: decodedCustom.id } });
            if (dbUser) {
              const restrictionService = require("../services/adminAccountRestrictions.service");
              dbUser = await restrictionService.refreshExpiredRestriction(dbUser);
              const accountRestriction = restrictionService.getEffectiveRestriction(dbUser);
              if (["TEMPORARY_SUSPENDED", "PERMANENTLY_SUSPENDED"].includes(accountRestriction)) {
                return res.status(403).json({ success: false, code: "ACCOUNT_DISABLED", message: "This account is currently disabled." });
              }
              if (accountRestriction === "NONE" && dbUser.adminRestrictionUpdatedAt && decodedCustom.iat && decodedCustom.iat * 1000 < new Date(dbUser.adminRestrictionUpdatedAt).getTime() - 1000) {
                return res.status(401).json({ success: false, code: "SESSION_REVOKED", message: "Your account access has changed. Please sign in again." });
              }
              req.user = { id: dbUser.id, uid: dbUser.id, email: decodedCustom.email, role: dbUser.role || "USER", accountRestriction, restrictionReason: dbUser.adminRestrictionReason || null };
            }
          }
        }
      }
    } catch (err) {
      console.warn("Optional protect token check failed, proceeding unauthenticated:", err.message);
    }
  }
  return next();
};

const requirePostingAccess = (req, res, next) => {
  if (req.user?.accountRestriction === "POSTING_RESTRICTED") {
    const reason = req.user.restrictionReason ? ` Reason: ${req.user.restrictionReason}` : "";
    return res.status(403).json({ success: false, code: "POSTING_RESTRICTED", message: `Posting is restricted on this account.${reason} You can still view your account and content.` });
  }
  return next();
};

module.exports = { protect, optionalProtect, requirePostingAccess };
