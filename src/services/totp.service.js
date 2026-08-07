const {
  generateSecret,
  generateURI,
  verify,
  generate,
  NobleCryptoPlugin,
  ScureBase32Plugin,
} = require("otplib");
const QRCode = require("qrcode");

const crypto = new NobleCryptoPlugin();
const base32 = new ScureBase32Plugin();
const ISSUER = "Spoken Odyssey";

/**
 * Generate a new TOTP secret and provisioning QR code.
 */
async function generateTotpSetup(userEmail) {
  const secret = generateSecret({ crypto, base32 });
  const otpauthUrl = generateURI({ secret, label: userEmail, issuer: ISSUER });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl,
  };
}

/**
 * Verify a 6-digit TOTP token against a secret.
 */
async function verifyTotpCode(secret, code) {
  if (!secret || !code) return false;
  const cleanCode = String(code).trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleanCode)) return false;

  try {
    const result = await verify({
      token: cleanCode,
      secret,
      crypto,
      base32,
      window: 1,
    });
    return !!(result && result.valid);
  } catch (err) {
    console.error("TOTP Verification Error:", err.message);
    return false;
  }
}

/**
 * Helper to generate TOTP code programmatically (for test suite)
 */
async function generateTotpCode(secret) {
  return await generate({ secret, crypto, base32 });
}

module.exports = {
  generateTotpSetup,
  verifyTotpCode,
  generateTotpCode,
};
