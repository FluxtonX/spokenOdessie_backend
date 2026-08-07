const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const prisma = require("../config/prisma");

// Simple in-memory challenge store (keyed by userId or challenge string) with expiration
const challengeStore = new Map();

function getRpConfig(req) {
  const host = req?.headers?.host?.split(":")[0] || "localhost";
  const rpID = process.env.RP_ID || (host === "localhost" || host === "127.0.0.1" ? "localhost" : host);
  
  const protocol = req?.headers?.["x-forwarded-proto"] || req?.protocol || "http";
  const originHeader = req?.headers?.origin;
  
  const expectedOrigin = process.env.EXPECTED_ORIGIN || originHeader || `${protocol}://${req?.headers?.host || "localhost:3000"}`;

  return {
    rpName: process.env.RP_NAME || "Spoken Odyssey",
    rpID,
    expectedOrigin,
  };
}

function storeChallenge(key, challenge) {
  challengeStore.set(key, {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  });
}

function getAndClearChallenge(key) {
  const entry = challengeStore.get(key);
  if (!entry) return null;
  challengeStore.delete(key);
  if (Date.now() > entry.expiresAt) return null;
  return entry.challenge;
}

/**
 * Generate WebAuthn Registration Options
 */
async function getRegistrationOptions(user, req) {
  const { rpName, rpID } = getRpConfig(req);

  const existingPasskeys = await prisma.passkey.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: Buffer.from(user.id),
    userName: user.email,
    userDisplayName: user.displayName || user.email.split("@")[0],
    attestationType: "none",
    excludeCredentials: existingPasskeys.map((p) => ({
      id: p.credentialId,
      transports: p.transports || [],
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  storeChallenge(`reg_${user.id}`, options.challenge);
  return options;
}

/**
 * Verify WebAuthn Registration Response and save Passkey to Prisma
 */
async function verifyAndSaveRegistration(user, body, deviceName = "Passkey Device", req) {
  const expectedChallenge = getAndClearChallenge(`reg_${user.id}`);
  if (!expectedChallenge) {
    throw new Error("Registration challenge expired or missing. Please try again.");
  }

  const { rpID, expectedOrigin } = getRpConfig(req);

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Passkey registration verification failed.");
  }

  const { credential } = verification.registrationInfo;

  // Handle simplewebauthn credential output structure
  const credentialId = credential.id || body.id;
  const publicKey = Buffer.from(credential.publicKey || credential.credentialPublicKey);
  const counter = BigInt(credential.counter || 0);
  const transports = body.response?.transports || [];

  const newPasskey = await prisma.passkey.create({
    data: {
      userId: user.id,
      credentialId,
      publicKey,
      counter,
      transports,
      deviceName: deviceName || "Passkey Device",
    },
  });

  return newPasskey;
}

/**
 * Generate WebAuthn Authentication Options
 */
async function getLoginOptions(userId = null, req) {
  const { rpID } = getRpConfig(req);

  let allowCredentials = [];
  if (userId) {
    const userPasskeys = await prisma.passkey.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });
    allowCredentials = userPasskeys.map((p) => ({
      id: p.credentialId,
      transports: p.transports || [],
    }));
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    userVerification: "preferred",
  });

  const challengeKey = userId ? `auth_${userId}` : `auth_anon_${options.challenge}`;
  storeChallenge(challengeKey, options.challenge);

  return options;
}

/**
 * Verify WebAuthn Login Assertion
 */
async function verifyLoginAssertion(body, userId = null, req) {
  const credentialId = body.id;
  if (!credentialId) {
    throw new Error("Credential ID missing from authentication response.");
  }

  const passkey = await prisma.passkey.findUnique({
    where: { credentialId },
    include: { user: true },
  });

  if (!passkey) {
    throw new Error("Passkey credential not registered on this account.");
  }

  const challengeKey = userId ? `auth_${userId}` : `auth_anon_${body.challenge || ""}`;
  let expectedChallenge = getAndClearChallenge(challengeKey);
  
  if (!expectedChallenge) {
    // Search any pending challenge if key didn't match directly
    for (const [k, v] of challengeStore.entries()) {
      if (k.startsWith("auth_")) {
        expectedChallenge = v.challenge;
        challengeStore.delete(k);
        break;
      }
    }
  }

  if (!expectedChallenge) {
    throw new Error("Authentication challenge expired or invalid.");
  }

  const { rpID, expectedOrigin } = getRpConfig(req);

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
    authenticator: {
      credentialID: passkey.credentialId,
      credentialPublicKey: Buffer.from(passkey.publicKey),
      counter: Number(passkey.counter),
    },
  });

  if (!verification.verified) {
    throw new Error("Passkey authentication signature verification failed.");
  }

  // Update sign counter and lastUsedAt
  const newCounter = BigInt(verification.authenticationInfo.newCounter);
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: {
      counter: newCounter,
      lastUsedAt: new Date(),
    },
  });

  return passkey.user;
}

module.exports = {
  getRegistrationOptions,
  verifyAndSaveRegistration,
  getLoginOptions,
  verifyLoginAssertion,
};
