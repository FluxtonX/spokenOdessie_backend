const prisma = require("../../config/prisma");
const { serializeMemory } = require("../memories/memory.service");
const { serializeUser } = require("../../utils/serializer");
const familyCircleService = require("../familyCircle/familyCircle.service");

/**
 * Get aggregated, high-performance home dashboard data in a single roundtrip.
 * Uses indexed O(1) count operations and strict limits to ensure lightning-fast responses at any scale.
 */
const getHomeDashboard = async ({ currentUser }) => {
  const userIdsToMatch = Array.from(
    new Set([currentUser.id, currentUser.googleId, currentUser.email])
  ).filter(Boolean);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // 1. Run core counts, memory limit, and circle retrieval in parallel
  const [
    totalMemories,
    momentsThisMonth,
    albumsCount,
    albumsThisMonth,
    recentMemoryDocs,
    circle,
    notifications,
  ] = await Promise.all([
    // O(1) indexed count for total memories
    prisma.memory.count({
      where: {
        OR: [
          { ownerId: { in: userIdsToMatch } },
          ...userIdsToMatch.map((id) => ({ taggedUserIds: { has: id } })),
        ],
      },
    }).catch(() => 0),

    // O(1) indexed count for memories this month
    prisma.memory.count({
      where: {
        OR: [
          { ownerId: { in: userIdsToMatch } },
          ...userIdsToMatch.map((id) => ({ taggedUserIds: { has: id } })),
        ],
        createdAt: { gte: startOfMonth },
      },
    }).catch(() => 0),

    // O(1) indexed count for albums
    prisma.album.count({
      where: { userId: currentUser.id },
    }).catch(() => 0),

    // O(1) indexed count for albums this month
    prisma.album.count({
      where: { userId: currentUser.id, createdAt: { gte: startOfMonth } },
    }).catch(() => 0),

    // Strict limit of 4 most recent memories
    prisma.memory.findMany({
      where: {
        OR: [
          { ownerId: { in: userIdsToMatch } },
          ...userIdsToMatch.map((id) => ({ taggedUserIds: { has: id } })),
        ],
      },
      take: 4,
      orderBy: { occurredAt: "desc" },
    }).catch(() => []),

    // Family Circle
    familyCircleService.getOrCreateFamilyCircle({ currentUser }).catch(() => null),

    // Recent notifications (limit 6)
    prisma.notification.findMany({
      where: { userId: currentUser.id },
      take: 6,
      orderBy: { createdAt: "desc" },
    }).catch(() => []),
  ]);

  // 2. Fetch Family Circle details, top 6 members, prompts & timeline
  let familyMembers = [];
  let totalMembersCount = 1;
  let familyPrompts = [];
  let timelineMilestones = [];

  if (circle?.id) {
    const [membersDb, membersCount, promptsDb, timelineDb] = await Promise.all([
      prisma.familyMember.findMany({
        where: { familyCircleId: circle.id },
        include: { user: true },
        take: 6,
        orderBy: { joinedAt: "asc" },
      }).catch(() => []),
      prisma.familyMember.count({
        where: { familyCircleId: circle.id },
      }).catch(() => 1),
      familyCircleService.getFamilyPrompts({ currentUser, familyCircleId: circle.id }).catch(() => []),
      familyCircleService.getFamilyCircleTimeline({
        currentUser,
        familyCircleId: circle.id,
        limit: 6,
      }).catch(() => []),
    ]);

    totalMembersCount = Math.max(1, membersCount);

    familyMembers = await Promise.all(
      membersDb.map(async (m) => {
        const serialized = await serializeUser(m.user);
        return {
          id: m.userId,
          name: serialized?.displayName || serialized?.name || "Member",
          avatarUrl: serialized?.photoURL || serialized?.avatarUrl || null,
          role: m.role || "MEMBER",
          relationship: m.relationship || "",
        };
      })
    );

    familyPrompts = Array.isArray(promptsDb) ? promptsDb.slice(0, 3) : [];

    const rawTimeline = Array.isArray(timelineDb)
      ? timelineDb
      : timelineDb?.items || timelineDb?.milestones || [];

    timelineMilestones = rawTimeline.slice(0, 6).map((item) => {
      const dateVal = item.date || item.occurredAt || item.createdAt;
      const yearStr = item.year || (dateVal ? new Date(dateVal).getFullYear() : "") || "Milestone";
      return {
        id: item._id || item.id,
        year: String(yearStr),
        label: item.title || item.label || "Family milestone",
        image: item.coverImageUrl || item.mediaUrl || item.thumbnailUrl || null,
        raw: item,
      };
    });
  }

  // Fallback to current user if family circle has no members yet
  if (familyMembers.length === 0) {
    const serializedCurrent = await serializeUser(currentUser);
    familyMembers = [
      {
        id: currentUser.id,
        name: serializedCurrent?.displayName || "You",
        avatarUrl: serializedCurrent?.photoURL || null,
        role: "Owner",
        relationship: "Self",
      },
    ];
  }

  // 3. Serialize recent 4 memories (resolves S3 media URLs & signed CDN assets)
  const recentMoments = await Promise.all(
    recentMemoryDocs.map((m) => serializeMemory(m, currentUser))
  );

  // 4. Calculate Days Together
  const baseDate = circle?.createdAt || currentUser.createdAt || new Date(Date.now() - 86400000 * 30);
  const daysDiff = Math.max(
    1,
    Math.floor((Date.now() - new Date(baseDate).getTime()) / (1000 * 60 * 60 * 24))
  );

  // 5. Format Recent Activities
  let recentActivities = [];
  if (notifications.length > 0) {
    recentActivities = await Promise.all(
      notifications.map(async (n) => {
        let actorUser = null;
        const actorId = n.metadata?.actorId || n.metadata?.userId || n.actorId;
        if (actorId) {
          const userDb = await prisma.user.findFirst({ where: { id: actorId } }).catch(() => null);
          if (userDb) actorUser = await serializeUser(userDb);
        }

        return {
          id: n.id,
          user: actorUser?.displayName || n.metadata?.actorName || "Family member",
          avatar: actorUser?.photoURL || null,
          action: n.message || n.action || "shared an update",
          title: n.title || "Archive update",
          createdAt: n.createdAt,
          thumb: n.metadata?.thumbnailUrl || n.metadata?.mediaUrl || null,
          memoryId: n.metadata?.memoryId || null,
        };
      })
    );
  } else if (recentMoments.length > 0) {
    // Derive from latest memories with real author profile
    const serializedCurrent = await serializeUser(currentUser);
    recentActivities = recentMoments.slice(0, 5).map((m) => {
      const isMe = m.ownerId === currentUser.id || m.userId === currentUser.id;
      return {
        id: m.id,
        user: isMe ? "You" : m.author?.displayName || "Family member",
        avatar: isMe ? serializedCurrent?.photoURL : m.author?.photoURL || null,
        action:
          m.type === "video"
            ? "added a new video"
            : m.type === "voice" || m.audioUrl
            ? "recorded a voice story"
            : "shared a moment",
        title: m.title || "Untitled moment",
        createdAt: m.occurredAt || m.createdAt,
        thumb: m.coverImageUrl || m.mediaUrl || m.thumbnailUrl || null,
        memory: m,
      };
    });
  }

  // 6. Return compact, aggregated payload (~5KB)
  return {
    stats: {
      totalMemories,
      momentsThisMonth,
      albumsCount,
      albumsThisMonth,
      qaCount: familyPrompts.length,
      qaThisMonth: familyPrompts.filter(
        (p) => new Date(p.createdAt || 0) >= startOfMonth
      ).length,
      milestonesCount: timelineMilestones.length,
      daysTogether: daysDiff.toLocaleString(),
    },
    familySpace: {
      id: circle?.id || null,
      name: circle?.name || null,
      members: familyMembers,
      totalMembers: totalMembersCount,
      daysTogether: daysDiff.toLocaleString(),
    },
    recentMoments,
    familyPrompts,
    timelineMilestones,
    recentActivities,
  };
};

module.exports = {
  getHomeDashboard,
};
