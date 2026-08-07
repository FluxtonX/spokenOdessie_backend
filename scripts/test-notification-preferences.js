/**
 * Spoken Odyssey — Notification Preferences Automated Test Suite
 * Run with: node scripts/test-notification-preferences.js
 */

process.env.NODE_ENV = "test";
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const prisma = require("../src/config/prisma");
const app = require("../src/app");
const http = require("http");
const { createNotification, getUserNotifications } = require("../src/modules/notifications/notification.service");
const { getUserNotificationPreferences, updateUserNotificationPreferences } = require("../src/services/notificationPreferences.service");

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

async function runPreferencesTests() {
  console.log("=================================================");
  console.log("🔔 NOTIFICATION PREFERENCES AUTOMATED TEST SUITE");
  console.log("=================================================\n");

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;

  const testEmail = `preftest_${Date.now()}@example.com`;
  const testPassword = "SuperPassword123!";

  try {
    // 1. Register test user
    console.log("Test 1: Register Test User");
    const regRes = await makeRequest("/api/auth/register", "POST", {
      email: testEmail,
      password: testPassword,
      displayName: "Preferences Tester",
    });
    if (regRes.status !== 201 || !regRes.body.token) {
      throw new Error("User registration failed");
    }
    const userToken = regRes.body.token;
    const userId = regRes.body.data.id;
    console.log("✓ Test user registered successfully\n");

    // 2. Fetch default notification preferences via API
    console.log("Test 2: GET /api/auth/notifications/preferences");
    const getPrefsRes = await makeRequest("/api/auth/notifications/preferences", "GET", null, userToken);
    if (getPrefsRes.status !== 200 || !getPrefsRes.body.preferences) {
      console.error("Get Prefs Error:", getPrefsRes.status, getPrefsRes.body);
      throw new Error("Failed to fetch default notification preferences");
    }
    if (getPrefsRes.body.preferences.followerActivity !== true) {
      throw new Error("Default followerActivity should be true");
    }
    console.log("✓ Default notification preferences retrieved successfully\n");

    // 3. Test Follower Notification Creation when enabled
    console.log("Test 3: Create Follower Notification (Enabled)");
    const notif1 = await createNotification({
      userId,
      type: "FOLLOW",
      title: "New Follower",
      message: "John Doe followed your profile",
    });
    if (!notif1 || notif1.type !== "FOLLOW") {
      throw new Error("Notification creation failed when preference is enabled");
    }
    console.log("✓ Notification created successfully when preference is enabled\n");

    // 4. Update Preference via API (Disable followerActivity)
    console.log("Test 4: PUT /api/auth/notifications/preferences (Disable Follower Activity)");
    const updateRes = await makeRequest("/api/auth/notifications/preferences", "PUT", {
      followerActivity: false,
    }, userToken);
    if (updateRes.status !== 200 || updateRes.body.preferences.followerActivity !== false) {
      throw new Error("Failed to update notification preferences via API");
    }
    console.log("✓ Preference updated via API (followerActivity = false)\n");

    // 5. Test Follower Notification Suppression when disabled
    console.log("Test 5: Verify Follower Notification Creation Suppression (Disabled)");
    const notif2 = await createNotification({
      userId,
      type: "FOLLOW",
      title: "New Follower 2",
      message: "Jane Doe followed your profile",
    });
    if (notif2 !== null) {
      throw new Error("Notification creation was NOT suppressed when preference is disabled!");
    }
    console.log("✓ Follower notification creation suppressed cleanly when preference is disabled\n");

    // 6. Test Family Activity Suppression when familyActivity = false
    console.log("Test 6: Disable Family Activity & Verify Family Notification Suppression");
    await makeRequest("/api/auth/notifications/preferences", "PUT", {
      familyActivity: false,
    }, userToken);

    const famNotif = await createNotification({
      userId,
      type: "FAMILY_MEMORY_SHARED",
      title: "Family Memory Shared",
      message: "Sarah shared a memory with family",
      metadata: { isFamilyActivity: true }
    });
    if (famNotif !== null) {
      throw new Error("Family notification was NOT suppressed when familyActivity is disabled!");
    }
    console.log("✓ Family Circle activity notifications suppressed cleanly when familyActivity is disabled\n");

    // 7. Test Retrieval-Time Filtering on Notifications Page API
    console.log("Test 7: Verify Retrieval-Time Notification Filtering");
    const userNotifs = await getUserNotifications({ userId });
    const hasFollowNotif = userNotifs.some(n => n.type === "FOLLOW");
    const hasFamilyNotif = userNotifs.some(n => n.type.startsWith("FAMILY"));
    if (hasFollowNotif || hasFamilyNotif) {
      throw new Error("Disabled notification category returned in user notifications list!");
    }
    console.log("✓ Disabled notification types cleanly filtered out from user notifications list\n");

    // 8. Re-enable Preferences and verify restoration
    console.log("Test 8: Re-enable Preferences and Verify Notification Restoration");
    await updateUserNotificationPreferences(userId, { followerActivity: true, familyActivity: true });
    const restoredNotifs = await getUserNotifications({ userId });
    const restoredFollowNotif = restoredNotifs.some(n => n.type === "FOLLOW");
    if (!restoredFollowNotif) {
      throw new Error("Re-enabled notification category failed to resurface!");
    }
    console.log("✓ Re-enabled notification category resurfaced on user notifications page\n");

    // Clean up test user
    await prisma.user.delete({ where: { id: userId } });

    console.log("=================================================");
    console.log("ALL NOTIFICATION PREFERENCE TESTS PASSED");
    console.log("=================================================");
  } catch (err) {
    console.error("\n❌ PREFERENCES TEST SUITE FAILED:", err.message);
    process.exitCode = 1;
  } finally {
    if (server) server.close();
  }
}

runPreferencesTests();
