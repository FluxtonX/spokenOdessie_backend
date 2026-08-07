const crypto = require("crypto");
const prisma = require("../config/prisma");

/**
 * Format a single random 8-character recovery code: XXXX-XXXX
 */
function generateRandomCode() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Readable alphanumeric characters
  let part1 = "";
  let part2 = "";
  for (let i = 0; i < 4; i++) {
    part1 += chars.charAt(Math.floor(Math.random() * chars.length));
    part2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${part1}-${part2}`;
}

function hashCode(code) {
  const normalized = String(code).toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Generate 8 new recovery codes for a user inside a database transaction.
 * Invalidates all previous codes for this user.
 * Returns the plaintext codes ONCE for display/download.
 */
async function generateAndStoreRecoveryCodes(userId) {
  const plainCodes = [];
  const records = [];

  for (let i = 0; i < 8; i++) {
    const code = generateRandomCode();
    plainCodes.push(code);
    records.push({
      userId,
      codeHash: hashCode(code),
    });
  }

  // Atomically delete old codes and insert new ones
  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({
      where: { userId },
    }),
    prisma.mfaRecoveryCode.createMany({
      data: records,
    }),
  ]);

  return plainCodes;
}

/**
 * Atomically verify and consume a recovery code.
 * Prevents race conditions and double consumption.
 */
async function verifyAndConsumeRecoveryCode(userId, inputCode) {
  if (!userId || !inputCode) return false;

  const targetHash = hashCode(inputCode);

  return await prisma.$transaction(async (tx) => {
    // Find unconsumed code matching hash
    const matchingCode = await tx.mfaRecoveryCode.findFirst({
      where: {
        userId,
        codeHash: targetHash,
        usedAt: null,
      },
    });

    if (!matchingCode) {
      return false;
    }

    // Mark as used atomically
    await tx.mfaRecoveryCode.update({
      where: { id: matchingCode.id },
      data: { usedAt: new Date() },
    });

    return true;
  });
}

module.exports = {
  generateAndStoreRecoveryCodes,
  verifyAndConsumeRecoveryCode,
};
