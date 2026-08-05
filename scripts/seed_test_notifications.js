const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const prisma = require("../src/config/prisma");

async function seedTestNotifications() {
  console.log("Starting notification seed script...");

  // Fetch all active users
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, email: true, displayName: true }
  });

  if (users.length === 0) {
    console.log("No active users found in database.");
    process.exit(0);
  }

  // Fetch at least one real memory from DB
  const sampleMemory = await prisma.memory.findFirst({
    orderBy: { createdAt: "desc" }
  });

  console.log(`Found ${users.length} active user(s):`, users.map(u => u.email));

  // Seed sample notifications for each user
  for (const user of users) {
    // Find another user to simulate as the follower
    const otherUser = users.find(u => u.id !== user.id) || user;

    console.log(`Seeding test notifications for user: ${user.email} (${user.id})`);

    const memoryId = sampleMemory ? sampleMemory.id : "sample-memory-id";

    const sampleNotifications = [
      {
        type: "FOLLOW",
        title: "New Follower",
        message: "Mudassir started following your public profile.",
        metadata: { followerId: otherUser.id },
        actionUrl: `/people/${otherUser.id}`
      },
      {
        type: "MEMORY_SHARED",
        title: "Memory Shared",
        message: "MuSafi shared a memory with you.",
        metadata: { memoryId, sharerId: otherUser.id },
        actionUrl: `/memories?memoryId=${memoryId}`
      },
      {
        type: "MEMORY_LIKE",
        title: "New Reaction",
        message: "S Engineer reacted ❤️ to your story 'Trip to the Mountains'.",
        metadata: { memoryId, reactorId: otherUser.id, reactionType: "heart" },
        actionUrl: `/memories?memoryId=${memoryId}`
      },
      {
        type: "COMMENT_REPLY",
        title: "New Comment Reply",
        message: "MuSafi replied to your comment: 'Thanks for sharing this story!'",
        metadata: { memoryId, replierId: otherUser.id },
        actionUrl: `/memories?memoryId=${memoryId}`
      },
      {
        type: "MEMORY_COMMENT",
        title: "New Comment",
        message: "Elena commented on your story: 'Such an inspiring reflection!'",
        metadata: { memoryId, commenterId: otherUser.id },
        actionUrl: `/memories?memoryId=${memoryId}`
      },
      {
        type: "COMMENT_REACTION",
        title: "New Reaction on Comment",
        message: "Sarah reacted 👍 to your comment.",
        metadata: { memoryId, reactorId: otherUser.id },
        actionUrl: `/memories?memoryId=${memoryId}`
      },
      {
        type: "FAMILY_INVITE_APPROVED",
        title: "Family Circle Approved",
        message: "Brigid approved your request to join Mitchell Family Circle.",
        metadata: { isTestSeed: true },
        actionUrl: "/family"
      },
      {
        type: "SECURITY",
        title: "Security Update",
        message: "System Security Alert: Successful login from new device.",
        metadata: { isTestSeed: true },
        actionUrl: "/settings/security"
      }
    ];

    for (const notif of sampleNotifications) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          actionUrl: notif.actionUrl,
          isRead: false,
          metadata: notif.metadata
        }
      });
    }
  }

  console.log("Successfully re-seeded updated test notifications for all active users!");
  process.exit(0);
}

seedTestNotifications().catch(err => {
  console.error("Error seeding test notifications:", err);
  process.exit(1);
});
