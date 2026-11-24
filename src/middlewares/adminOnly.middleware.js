const jwt = require("jsonwebtoken");
const crypto = require("crypto");

async function adminOnly(req, res, next) {
  const configuredEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const configuredPassword = String(process.env.ADMIN_PASSWORD || "");
  if (!configuredEmail || !configuredPassword || !process.env.JWT_SECRET) {
    return res.status(503).json({ success: false, message: "Admin access is not configured on the server." });
  }

  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i);
  if (!bearer) return res.status(401).json({ success: false, message: "Admin sign-in required." });

  try {
    const claims = jwt.verify(bearer[1], process.env.JWT_SECRET);
    const currentPasswordVersion = crypto.createHash("sha256").update(configuredPassword).digest("hex");
    if (claims.type !== "ADMIN_SESSION" || claims.email !== configuredEmail || claims.passwordVersion !== currentPasswordVersion) {
      return res.status(403).json({ success: false, message: "Admin access is restricted." });
    }
    req.admin = { email: configuredEmail, sessionId: claims.jti };
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Admin session is invalid or has expired." });
  }
}

module.exports = adminOnly;
