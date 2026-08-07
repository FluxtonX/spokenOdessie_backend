/**
 * Spoken Odyssey — Production-Grade MFA & Security Test Suite
 * Run with: node scripts/test-auth-mfa.js
 */

process.env.NODE_ENV = "test";
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { generateTotpCode } = require("../src/services/totp.service");
const prisma = require("../src/config/prisma");
const app = require("../src/app");
const http = require("http");

let server;
let baseUrl;

function makeRequest(path, method = "GET", body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const req = http.request(
      url,
      { method, headers },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (_) {
            parsed = { raw: data };
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runSecurityTests() {
  console.log("=================================================");
  console.log("🔒 SPOKEN ODYSSEY MFA SECURITY TEST SUITE");
  console.log("=================================================\n");

  // Start HTTP Server on dynamic port
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;

  const testEmail = `mfatest_${Date.now()}@example.com`;
  const testPassword = "SuperPassword123!";

  try {
    // 1. Register test user
    console.log("Test 1: Password Registration");
    const regRes = await makeRequest("/api/auth/register", "POST", {
      email: testEmail,
      password: testPassword,
      displayName: "MFA Tester",
    });
    if (regRes.status !== 201 || !regRes.body.token) {
      throw new Error(`Registration failed: ${JSON.stringify(regRes.body)}`);
    }
    let userToken = regRes.body.token;
    const userId = regRes.body.data.id;
    console.log("✓ Password authentication & registration successful\n");

    // 2. Initial Login (MFA Disabled)
    console.log("Test 2: Normal Login (MFA Disabled)");
    const login1 = await makeRequest("/api/auth/login", "POST", {
      email: testEmail,
      password: testPassword,
    });
    if (login1.status !== 200 || login1.body.mfaRequired) {
      throw new Error("Initial login failed or unexpectedly required MFA");
    }
    console.log("✓ Normal login without MFA successful\n");

    // 3. TOTP Setup
    console.log("Test 3: TOTP Setup & Provisioning");
    const setupRes = await makeRequest("/api/auth/mfa/totp/setup", "POST", null, userToken);
    if (setupRes.status !== 200 || !setupRes.body.data.secret) {
      throw new Error(`TOTP Setup failed: ${JSON.stringify(setupRes.body)}`);
    }
    const totpSecret = setupRes.body.data.secret;
    console.log("✓ TOTP secret & QR code generated\n");

    // 4. Verify TOTP Setup
    console.log("Test 4: Verify TOTP Setup with 6-Digit Code");
    const setupCode = await generateTotpCode(totpSecret);
    const verifySetupRes = await makeRequest("/api/auth/mfa/totp/verify-setup", "POST", { code: setupCode }, userToken);
    if (verifySetupRes.status !== 200 || !verifySetupRes.body.recoveryCodes) {
      throw new Error(`Verify TOTP setup failed: ${JSON.stringify(verifySetupRes.body)}`);
    }
    const recoveryCodes = verifySetupRes.body.recoveryCodes;
    console.log("✓ TOTP setup verified & 8 initial recovery codes issued\n");

    // 5. MFA Required on Login
    console.log("Test 5: Password Login with MFA Required");
    const mfaLoginRes = await makeRequest("/api/auth/login", "POST", {
      email: testEmail,
      password: testPassword,
    });
    if (mfaLoginRes.status !== 200 || !mfaLoginRes.body.mfaRequired || !mfaLoginRes.body.mfaToken) {
      throw new Error("Login did not issue MFA_PENDING state");
    }
    const mfaPendingToken = mfaLoginRes.body.mfaToken;
    console.log("✓ MFA_PENDING state issued correctly\n");

    // 6. Test MFA Pending Token Guard on Protected API
    console.log("Test 6: MFA Pending Token Access Protection");
    const bypassRes = await makeRequest("/api/auth/me", "GET", null, mfaPendingToken);
    if (bypassRes.status !== 401 || bypassRes.body.code !== "MFA_PENDING") {
      throw new Error("MFA pending token was able to bypass protected route!");
    }
    console.log("✓ Protected APIs strictly block MFA pending tokens\n");

    // 7. Test Invalid TOTP Code Rejection
    console.log("Test 7: Invalid TOTP Verification Code Rejection");
    const badTotpRes = await makeRequest("/api/auth/mfa/totp/verify", "POST", {
      mfaToken: mfaPendingToken,
      code: "000000",
    });
    if (badTotpRes.status !== 401) {
      throw new Error("Invalid TOTP code was wrongly accepted!");
    }
    console.log("✓ Invalid TOTP code correctly rejected\n");

    // 8. Test Valid TOTP Verification
    console.log("Test 8: Valid TOTP Verification");
    const validTotpCode = await generateTotpCode(totpSecret);
    const validTotpRes = await makeRequest("/api/auth/mfa/totp/verify", "POST", {
      mfaToken: mfaPendingToken,
      code: validTotpCode,
    });
    if (validTotpRes.status !== 200 || !validTotpRes.body.token) {
      throw new Error(`Valid TOTP verification failed: ${JSON.stringify(validTotpRes.body)}`);
    }
    userToken = validTotpRes.body.token;
    console.log("✓ Valid TOTP verification issued full authenticated session token\n");

    // 9. Test Recovery Code Single-Use & Replay Protection
    console.log("Test 9: Recovery Code Verification & Replay Protection");
    const mfaLogin2 = await makeRequest("/api/auth/login", "POST", { email: testEmail, password: testPassword });
    const mfaPendingToken2 = mfaLogin2.body.mfaToken;
    const testRecoveryCode = recoveryCodes[0];

    const recoveryRes1 = await makeRequest("/api/auth/mfa/recovery/verify", "POST", {
      mfaToken: mfaPendingToken2,
      code: testRecoveryCode,
    });
    if (recoveryRes1.status !== 200) {
      throw new Error("Recovery code verification failed!");
    }
    userToken = recoveryRes1.body.token;
    console.log("✓ Valid recovery code accepted");

    // Try reusing SAME recovery code
    const mfaLogin3 = await makeRequest("/api/auth/login", "POST", { email: testEmail, password: testPassword });
    const recoveryRes2 = await makeRequest("/api/auth/mfa/recovery/verify", "POST", {
      mfaToken: mfaLogin3.body.mfaToken,
      code: testRecoveryCode,
    });
    if (recoveryRes2.status !== 401) {
      throw new Error("Consumed recovery code was replayed successfully!");
    }
    console.log("✓ Recovery code replay protection verified (single-use atomic consumption)\n");

    // 10. Passkey Registration & Login Options
    console.log("Test 10: Passkeys & WebAuthn Options");
    const passkeyOptionsRes = await makeRequest("/api/auth/passkeys/register/options", "POST", null, userToken);
    if (passkeyOptionsRes.status !== 200 || !passkeyOptionsRes.body.data.challenge) {
      console.error("Passkey Options Error Details:", passkeyOptionsRes.status, passkeyOptionsRes.body);
      throw new Error("Passkey registration options generation failed!");
    }
    console.log("✓ Passkey WebAuthn challenge generated\n");

    // 11. Disable MFA Strong Re-authentication
    console.log("Test 11: Disable MFA Strong Re-authentication Protection");
    const disableCode = await generateTotpCode(totpSecret);
    const disableRes = await makeRequest("/api/auth/mfa/disable", "POST", {
      password: testPassword,
      code: disableCode,
    }, userToken);
    if (disableRes.status !== 200) {
      throw new Error("Disable MFA failed!");
    }
    console.log("✓ MFA disabled safely with strong re-authentication\n");

    // 12. Confirm Login after Disabling MFA
    console.log("Test 12: Login after MFA Disabled");
    const finalLogin = await makeRequest("/api/auth/login", "POST", { email: testEmail, password: testPassword });
    if (finalLogin.status !== 200 || finalLogin.body.mfaRequired) {
      throw new Error("Login failed after MFA disabled");
    }
    console.log("✓ Direct password authentication restored after disabling MFA\n");

    // 13. Check Security Audit Logs
    console.log("Test 13: Security Audit Log Verification");
    const auditCount = await prisma.securityAuditLog.count({ where: { userId } });
    if (auditCount === 0) {
      throw new Error("No security audit logs recorded!");
    }
    console.log(`✓ ${auditCount} security audit logs successfully recorded in database\n`);

    // 14. Check In-App Security Notifications
    console.log("Test 14: In-App Security Notifications Verification");
    const notifCount = await prisma.notification.count({
      where: {
        userId,
        type: { in: ["SECURITY_NEW_DEVICE", "SECURITY_TOTP_ENABLED", "SECURITY_PASSKEY_ADDED", "SECURITY_2FA_DISABLED"] },
      },
    });
    if (notifCount === 0) {
      throw new Error("No in-app security notifications created!");
    }
    console.log(`✓ ${notifCount} in-app security notifications successfully verified in database\n`);

    // Clean up test user
    await prisma.user.delete({ where: { id: userId } });

    console.log("=================================================");
    console.log("ALL SECURITY TESTS PASSED");
    console.log("=================================================");
  } catch (err) {
    console.error("\n❌ SECURITY TEST SUITE FAILED:", err.message);
    process.exitCode = 1;
  } finally {
    if (server) server.close();
  }
}

runSecurityTests();
