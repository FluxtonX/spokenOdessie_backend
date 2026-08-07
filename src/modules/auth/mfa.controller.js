const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../../config/prisma");
const { logSecurityEvent } = require("../../services/audit.service");
const { generateMfaPendingToken, verifyMfaPendingToken, getUserMfaState } = require("../../services/mfa.service");
const { generateTotpSetup, verifyTotpCode } = require("../../services/totp.service");
const { generateAndStoreRecoveryCodes, verifyAndConsumeRecoveryCode } = require("../../services/recovery.service");
const {
  getRegistrationOptions,
  verifyAndSaveRegistration,
  getLoginOptions,
  verifyLoginAssertion,
} = require("../../services/passkey.service");

const JWT_SECRET = process.env.JWT_SECRET || "spoken_odyssey_super_secret_key_12345";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const crypto = require("crypto");
const { registerUserSession } = require("../../services/session.service");

async function issueAuthToken(user, req) {
  const sessionJti = crypto.randomUUID();
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role || "USER", jti: sessionJti },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  if (req) {
    try {
      await registerUserSession({ userId: user.id, sessionJti, req });
    } catch (err) {
      console.warn("Failed to register user session:", err.message);
    }
  }

  return token;
}

async function serializeUser(user) {
  if (!user) return null;
  const result = { ...user };
  delete result.password;
  result.firebaseUid = user.id;
  result.uid = user.id;
  return result;
}

/**
 * @desc Setup TOTP (Step 1: Generate QR & secret)
 * @route POST /api/auth/mfa/totp/setup
 * @access Private
 */
const setupTotp = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { secret, otpauthUrl, qrCodeDataUrl } = await generateTotpSetup(user.email);

    // Save pending secret to DB
    await prisma.mfaTotpSecret.upsert({
      where: { userId },
      update: { secret, verified: false },
      create: { userId, secret, verified: false },
    });

    await logSecurityEvent({ userId, action: "TOTP_SETUP_STARTED", req });

    res.status(200).json({
      success: true,
      data: {
        secret,
        otpauthUrl,
        qrCodeDataUrl,
      },
    });
  } catch (err) {
    console.error("Setup TOTP Error:", err.message);
    res.status(500).json({ success: false, message: "Failed to initialize TOTP setup" });
  }
};

/**
 * @desc Verify TOTP Setup (Step 2: Confirm code & activate TOTP)
 * @route POST /api/auth/mfa/totp/verify-setup
 * @access Private
 */
const verifyTotpSetup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: "Verification code is required" });
    }

    const totpRecord = await prisma.mfaTotpSecret.findUnique({ where: { userId } });
    if (!totpRecord || !totpRecord.secret) {
      return res.status(400).json({ success: false, message: "TOTP setup not initiated. Please start setup again." });
    }

    const isValid = await verifyTotpCode(totpRecord.secret, code);
    if (!isValid) {
      await logSecurityEvent({ userId, action: "TOTP_SETUP_FAILED", req });
      return res.status(400).json({
        success: false,
        code: "MFA_CODE_INVALID",
        message: "Invalid verification code. Please check your authenticator app and try again.",
      });
    }

    // Mark secret verified & enable MFA on user
    await prisma.mfaTotpSecret.update({
      where: { userId },
      data: { verified: true },
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const existingTypes = user.mfaTypes || [];
    const newTypes = Array.from(new Set([...existingTypes, "TOTP"]));

    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaTypes: newTypes,
      },
    });

    // Generate fresh recovery codes
    const recoveryCodes = await generateAndStoreRecoveryCodes(userId);

    await logSecurityEvent({ userId, action: "TOTP_SETUP_COMPLETED", req });

    // Create in-app Notification
    prisma.notification
      .create({
        data: {
          userId,
          type: "SECURITY_TOTP_ENABLED",
          title: "Authenticator App 2FA Activated",
          message: "Two-Factor Authentication via Authenticator App (TOTP) is now active on your account.",
          actionUrl: "/settings/security",
        },
      })
      .catch((err) => console.warn("Failed to create TOTP notification:", err.message));

    res.status(200).json({
      success: true,
      message: "Authenticator App activated successfully!",
      recoveryCodes,
    });
  } catch (err) {
    console.error("Verify TOTP Setup Error:", err.message);
    res.status(500).json({ success: false, message: "Failed to verify TOTP setup" });
  }
};

/**
 * @desc Verify TOTP Login (Step 3: Secondary auth factor during login)
 * @route POST /api/auth/mfa/totp/verify
 * @access Public (Requires mfaToken)
 */
const verifyTotpLogin = async (req, res) => {
  try {
    const { mfaToken, code } = req.body;

    if (!mfaToken || !code) {
      return res.status(400).json({ success: false, message: "MFA pending token and verification code are required" });
    }

    const decoded = verifyMfaPendingToken(mfaToken);
    const userId = decoded.id;

    const totpRecord = await prisma.mfaTotpSecret.findUnique({ where: { userId } });
    if (!totpRecord || !totpRecord.verified || !totpRecord.secret) {
      return res.status(400).json({ success: false, message: "TOTP is not configured for this account" });
    }

    const isValid = await verifyTotpCode(totpRecord.secret, code);
    if (!isValid) {
      await logSecurityEvent({ userId, action: "TOTP_VERIFY_FAILED", req });
      return res.status(401).json({
        success: false,
        code: "MFA_CODE_INVALID",
        message: "Verification code is incorrect or expired.",
      });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { lastLogin: new Date() },
    });

    const token = await issueAuthToken(user, req);
    await logSecurityEvent({ userId, action: "TOTP_VERIFY_SUCCESS", req });

    res.status(200).json({
      success: true,
      token,
      data: await serializeUser(user),
    });
  } catch (err) {
    console.error("Verify TOTP Login Error:", err.message);
    res.status(401).json({ success: false, message: err.message || "MFA verification failed" });
  }
};

/**
 * @desc Verify Recovery Code Login
 * @route POST /api/auth/mfa/recovery/verify
 * @access Public (Requires mfaToken)
 */
const verifyRecoveryLogin = async (req, res) => {
  try {
    const { mfaToken, code } = req.body;

    if (!mfaToken || !code) {
      return res.status(400).json({ success: false, message: "MFA pending token and recovery code are required" });
    }

    const decoded = verifyMfaPendingToken(mfaToken);
    const userId = decoded.id;

    const isValid = await verifyAndConsumeRecoveryCode(userId, code);
    if (!isValid) {
      await logSecurityEvent({ userId, action: "RECOVERY_CODE_FAILED", req });
      return res.status(401).json({
        success: false,
        code: "RECOVERY_CODE_INVALID",
        message: "Recovery code is invalid or has already been used.",
      });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { lastLogin: new Date() },
    });

    const token = await issueAuthToken(user, req);
    await logSecurityEvent({ userId, action: "RECOVERY_CODE_USED", req });

    res.status(200).json({
      success: true,
      token,
      data: await serializeUser(user),
    });
  } catch (err) {
    console.error("Verify Recovery Login Error:", err.message);
    res.status(401).json({ success: false, message: err.message || "Recovery code verification failed" });
  }
};

/**
 * @desc Passkey Register Options
 * @route POST /api/auth/passkeys/register/options
 * @access Private
 */
const passkeyRegisterOptions = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const options = await getRegistrationOptions(user, req);
    res.status(200).json({ success: true, data: options });
  } catch (err) {
    console.error("Passkey Reg Options Error:", err.message);
    res.status(500).json({ success: false, message: err.message || "Failed to generate passkey options" });
  }
};

/**
 * @desc Passkey Register Verify
 * @route POST /api/auth/passkeys/register/verify
 * @access Private
 */
const passkeyRegisterVerify = async (req, res) => {
  try {
    const userId = req.user.id;
    const { response, deviceName } = req.body;

    if (!response) {
      return res.status(400).json({ success: false, message: "WebAuthn credential response is required" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const passkey = await verifyAndSaveRegistration(user, response, deviceName, req);

    const existingTypes = user.mfaTypes || [];
    const newTypes = Array.from(new Set([...existingTypes, "PASSKEY"]));

    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaTypes: newTypes,
      },
    });

    // Check if recovery codes exist, generate if missing
    const recoveryCount = await prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
    let recoveryCodes = null;
    if (recoveryCount === 0) {
      recoveryCodes = await generateAndStoreRecoveryCodes(userId);
    }

    const safePasskey = {
      id: passkey.id,
      credentialId: passkey.credentialId,
      counter: Number(passkey.counter || 0),
      deviceName: passkey.deviceName,
      createdAt: passkey.createdAt,
      lastUsedAt: passkey.lastUsedAt,
    };

    await logSecurityEvent({ userId, action: "PASSKEY_REGISTERED", req, metadata: { deviceName } });

    // Create in-app Notification
    prisma.notification
      .create({
        data: {
          userId,
          type: "SECURITY_PASSKEY_ADDED",
          title: "New Passkey Registered",
          message: `Passkey "${deviceName}" registered successfully for fast biometric sign-in.`,
          actionUrl: "/settings/security",
          metadata: { deviceName },
        },
      })
      .catch((err) => console.warn("Failed to create Passkey notification:", err.message));

    res.status(200).json({
      success: true,
      message: "Passkey registered successfully!",
      passkey: safePasskey,
      recoveryCodes,
    });
  } catch (err) {
    console.error("Passkey Reg Verify Error:", err.message);
    res.status(400).json({ success: false, message: err.message || "Passkey registration failed" });
  }
};

/**
 * @desc Passkey Login Options
 * @route POST /api/auth/passkeys/login/options
 * @access Public / MFA Pending
 */
const passkeyLoginOptions = async (req, res) => {
  try {
    const { mfaToken } = req.body;
    let userId = null;
    if (mfaToken) {
      try {
        const decoded = verifyMfaPendingToken(mfaToken);
        userId = decoded.id;
      } catch (_) {}
    }

    const options = await getLoginOptions(userId, req);
    res.status(200).json({ success: true, data: options });
  } catch (err) {
    console.error("Passkey Login Options Error:", err.message);
    res.status(500).json({ success: false, message: err.message || "Failed to generate passkey login options" });
  }
};

/**
 * @desc Passkey Login Verify
 * @route POST /api/auth/passkeys/login/verify
 * @access Public / MFA Pending
 */
const passkeyLoginVerify = async (req, res) => {
  try {
    const { response, mfaToken } = req.body;
    let userId = null;
    if (mfaToken) {
      try {
        const decoded = verifyMfaPendingToken(mfaToken);
        userId = decoded.id;
      } catch (_) {}
    }

    const user = await verifyLoginAssertion(response, userId, req);
    const token = await issueAuthToken(user, req);

    await logSecurityEvent({ userId: user.id, action: "PASSKEY_LOGIN_SUCCESS", req });

    res.status(200).json({
      success: true,
      token,
      data: await serializeUser(user),
    });
  } catch (err) {
    console.error("Passkey Login Verify Error:", err.message);
    res.status(401).json({ success: false, message: err.message || "Passkey authentication failed" });
  }
};

/**
 * @desc Get User MFA Security Status
 * @route GET /api/auth/mfa/status
 * @access Private
 */
const getMfaStatus = async (req, res) => {
  try {
    const mfaState = await getUserMfaState(req.user.id);
    if (!mfaState) return res.status(404).json({ success: false, message: "User not found" });

    res.status(200).json({ success: true, data: mfaState });
  } catch (err) {
    console.error("Get MFA Status Error:", err.message);
    res.status(500).json({ success: false, message: "Failed to retrieve MFA status" });
  }
};

/**
 * @desc Delete Registered Passkey
 * @route DELETE /api/auth/passkeys/:id
 * @access Private
 */
const deletePasskey = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const passkey = await prisma.passkey.findFirst({
      where: { id, userId },
    });

    if (!passkey) {
      return res.status(404).json({ success: false, message: "Passkey not found" });
    }

    await prisma.passkey.delete({ where: { id } });

    // Update MFA state if no passkeys left
    const remainingPasskeys = await prisma.passkey.count({ where: { userId } });
    const totpRecord = await prisma.mfaTotpSecret.findUnique({ where: { userId } });
    const totpActive = !!(totpRecord && totpRecord.verified);

    if (remainingPasskeys === 0) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const newTypes = (user.mfaTypes || []).filter((t) => t !== "PASSKEY");
      await prisma.user.update({
        where: { id: userId },
        data: {
          mfaTypes: newTypes,
          mfaEnabled: totpActive,
        },
      });
    }

    await logSecurityEvent({ userId, action: "PASSKEY_REMOVED", req });

    res.status(200).json({ success: true, message: "Passkey removed successfully" });
  } catch (err) {
    console.error("Delete Passkey Error:", err.message);
    res.status(500).json({ success: false, message: "Failed to delete passkey" });
  }
};

/**
 * @desc Regenerate Recovery Codes (Requires Strong Re-auth)
 * @route POST /api/auth/mfa/recovery/regenerate
 * @access Private
 */
const regenerateRecoveryCodes = async (req, res) => {
  try {
    const userId = req.user.id;
    const { password, code } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Re-authenticate password if user has one
    if (user.password) {
      if (!password) {
        return res.status(400).json({ success: false, message: "Current password is required to regenerate recovery codes" });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: "Incorrect password" });
      }
    }

    // Re-verify TOTP code if TOTP active
    const totpRecord = await prisma.mfaTotpSecret.findUnique({ where: { userId } });
    if (totpRecord && totpRecord.verified) {
      if (!code || !(await verifyTotpCode(totpRecord.secret, code))) {
        return res.status(401).json({ success: false, message: "Valid 6-digit TOTP verification code is required" });
      }
    }

    const recoveryCodes = await generateAndStoreRecoveryCodes(userId);
    await logSecurityEvent({ userId, action: "RECOVERY_CODES_REGENERATED", req });

    res.status(200).json({
      success: true,
      message: "New recovery codes generated successfully",
      recoveryCodes,
    });
  } catch (err) {
    console.error("Regenerate Recovery Codes Error:", err.message);
    res.status(500).json({ success: false, message: "Failed to regenerate recovery codes" });
  }
};

/**
 * @desc Disable MFA completely (Requires Strong Re-auth)
 * @route POST /api/auth/mfa/disable
 * @access Private
 */
const disableMfa = async (req, res) => {
  try {
    const userId = req.user.id;
    const { password, code } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Verify Password if set
    if (user.password) {
      if (!password) {
        return res.status(400).json({ success: false, message: "Account password is required to disable MFA" });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: "Incorrect account password" });
      }
    }

    // Verify current TOTP / recovery code factor if present
    const totpRecord = await prisma.mfaTotpSecret.findUnique({ where: { userId } });
    if (totpRecord && totpRecord.verified) {
      if (!code) {
        return res.status(400).json({ success: false, message: "Current 6-digit authenticator code or recovery code is required to disable MFA" });
      }
      const isTotpValid = await verifyTotpCode(totpRecord.secret, code);
      const isRecoveryValid = isTotpValid ? false : await verifyAndConsumeRecoveryCode(userId, code);

      if (!isTotpValid && !isRecoveryValid) {
        return res.status(401).json({ success: false, message: "Verification code or recovery code is invalid" });
      }
    }

    // Turn off MFA and clear secrets
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaTypes: [],
        },
      }),
      prisma.mfaTotpSecret.deleteMany({ where: { userId } }),
      prisma.passkey.deleteMany({ where: { userId } }),
      prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    ]);

    await logSecurityEvent({ userId, action: "MFA_DISABLED", req });

    // Create in-app Notification
    prisma.notification
      .create({
        data: {
          userId,
          type: "SECURITY_2FA_DISABLED",
          title: "Two-Factor Authentication Disabled",
          message: "2FA protection was deactivated on your account. Re-enable it anytime in Security Settings.",
          actionUrl: "/settings/security",
        },
      })
      .catch((err) => console.warn("Failed to create Disable MFA notification:", err.message));

    res.status(200).json({
      success: true,
      message: "Multi-Factor Authentication (MFA) has been disabled.",
    });
  } catch (err) {
    console.error("Disable MFA Error:", err.message);
    res.status(500).json({ success: false, message: "Failed to disable MFA" });
  }
};

module.exports = {
  setupTotp,
  verifyTotpSetup,
  verifyTotpLogin,
  verifyRecoveryLogin,
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  passkeyLoginOptions,
  passkeyLoginVerify,
  getMfaStatus,
  deletePasskey,
  regenerateRecoveryCodes,
  disableMfa,
};
