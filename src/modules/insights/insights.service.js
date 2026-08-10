const prisma = require("../../config/prisma");

/**
 * Get real-time aggregated insights and analytics for a user
 */
async function getUserInsightsSummary(userId) {
  const memories = await prisma.memory.findMany({
    where: { ownerId: userId },
    select: {
      id: true,
      title: true,
      description: true,
      tags: true,
      taggedUserIds: true,
      mood: true,
      type: true,
      privacy: true,
      occurredAt: true,
      createdAt: true,
      mediaMimeType: true,
      likes: true,
      commentsCount: true,
      shares: true,
    },
    orderBy: { occurredAt: "desc" },
  });

  const totalMemories = memories.length;

  if (totalMemories === 0) {
    // If user has 0 memories, fetch connected family members for peopleInArchive
    let familyPeople = [];
    try {
      const connections = await prisma.familyConnection.findMany({
        where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
        take: 10,
      });
      const famUserIds = connections.map(c => c.user1Id === userId ? c.user2Id : c.user1Id).filter(Boolean);
      if (famUserIds.length > 0) {
        const famUsers = await prisma.user.findMany({
          where: { id: { in: famUserIds } },
          select: { id: true, displayName: true, photoURL: true, email: true }
        });
        const bgs = ["bg-[#4A3AFF]", "bg-indigo-600", "bg-purple-600", "bg-emerald-600", "bg-amber-600"];
        familyPeople = famUsers.map((u, idx) => ({
          name: u.displayName || u.email?.split("@")[0] || "Family Connection",
          avatar: u.photoURL || "",
          count: "Connected Family",
          bg: bgs[idx % bgs.length],
        }));
      }
    } catch (_) {}

    return {
      stats: {
        totalMemories: 0,
        voiceHours: "0.0h",
        wordsWritten: "0k",
        milestones: 0,
        yearsCovered: 0,
      },
      legacyScore: 10,
      lifeSummary: "Start your journey today by recording your first voice memory or written journal entry.",
      lifeThemes: [
        { name: "Family & Love", value: 30, color: "#4A3AFF" },
        { name: "Home & Belonging", value: 25, color: "#10B981" },
        { name: "Career & Craft", value: 20, color: "#F59E0B" },
        { name: "Adventure", value: 15, color: "#06B6D4" },
        { name: "Faith & Purpose", value: 10, color: "#8B5CF6" },
      ],
      emotionalLandscape: {
        joy: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        reflection: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        gratitude: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        melancholy: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
      wordCloud: [
        { text: "Family", weight: 32 },
        { text: "Home", weight: 24 },
        { text: "Memory", weight: 20 },
        { text: "Journey", weight: 16 },
      ],
      peopleInArchive: familyPeople,
      insights: [
        {
          title: "Archive Started",
          desc: "Your spoken history archive is ready. Record your first voice note to see real-time insights.",
          icon: "TrendingUp",
          iconColor: "text-emerald-500",
        },
      ],
      forgottenMemory: null,
    };
  }

  // 1. Calculate Core Statistics
  let totalWords = 0;
  let voiceMemoryCount = 0;
  let voiceMinutes = 0;
  let milestoneCount = 0;
  const years = new Set();
  const tagFrequency = {};
  const taggedUserCounts = {};

  const monthlyMoods = {
    joy: Array(12).fill(0),
    reflection: Array(12).fill(0),
    gratitude: Array(12).fill(0),
    melancholy: Array(12).fill(0),
  };

  memories.forEach((m) => {
    // Words count
    if (m.description) {
      const words = m.description.trim().split(/\s+/).filter(Boolean).length;
      totalWords += words;
    }

    // Type checking
    const normType = String(m.type || "").toLowerCase();
    const isVoice = normType === "voice" || normType === "audio" || String(m.mediaMimeType || "").startsWith("audio/");
    if (isVoice) {
      voiceMemoryCount += 1;
      voiceMinutes += 3; // Average 3 minutes per voice memory
    }

    // Milestones
    const isMilestone = normType === "milestone" || (Array.isArray(m.tags) && m.tags.some((t) => String(t).toLowerCase() === "milestone"));
    if (isMilestone) {
      milestoneCount += 1;
    }

    // Tagged User IDs
    if (Array.isArray(m.taggedUserIds)) {
      m.taggedUserIds.forEach((tid) => {
        if (tid) {
          taggedUserCounts[tid] = (taggedUserCounts[tid] || 0) + 1;
        }
      });
    }

    // Years
    const memDate = new Date(m.occurredAt || m.createdAt);
    if (!isNaN(memDate.getTime())) {
      years.add(memDate.getFullYear());

      // Monthly Mood distribution
      const monthIdx = memDate.getMonth();
      const moodStr = String(m.mood || "").toLowerCase();
      if (moodStr.includes("joy") || moodStr.includes("happy") || moodStr.includes("excit")) {
        monthlyMoods.joy[monthIdx] += 1;
      } else if (moodStr.includes("reflect") || moodStr.includes("calm") || moodStr.includes("thought")) {
        monthlyMoods.reflection[monthIdx] += 1;
      } else if (moodStr.includes("warm") || moodStr.includes("thank") || moodStr.includes("love") || moodStr.includes("grati")) {
        monthlyMoods.gratitude[monthIdx] += 1;
      } else if (moodStr.includes("sad") || moodStr.includes("grief") || moodStr.includes("nostalg")) {
        monthlyMoods.melancholy[monthIdx] += 1;
      } else {
        monthlyMoods.reflection[monthIdx] += 1;
      }
    }

    // Tags Frequency
    if (Array.isArray(m.tags)) {
      m.tags.forEach((tag) => {
        const cleanTag = String(tag).replace(/^#/, "").trim();
        if (!cleanTag) return;
        tagFrequency[cleanTag] = (tagFrequency[cleanTag] || 0) + 1;
      });
    }
  });

  const voiceHoursNum = (voiceMinutes / 60).toFixed(1);
  const wordsFormatted = totalWords > 1000 ? `${(totalWords / 1000).toFixed(1)}k` : `${totalWords}`;
  const yearsCoveredCount = years.size > 0 ? (Math.max(...years) - Math.min(...years) + 1) : 1;

  // 2. Legacy Score
  const rawScore = (totalMemories * 1.5) + (parseFloat(voiceHoursNum) * 4) + (milestoneCount * 5) + (yearsCoveredCount * 3) + 20;
  const legacyScore = Math.min(99, Math.max(15, Math.round(rawScore)));

  // 3. Life Themes Distribution
  const sortedTags = Object.entries(tagFrequency).sort((a, b) => b[1] - a[1]);
  const categoryBuckets = {
    "Family & Love": 0,
    "Home & Belonging": 0,
    "Career & Craft": 0,
    "Adventure": 0,
    "Faith & Purpose": 0,
  };

  sortedTags.forEach(([tag, count]) => {
    const t = tag.toLowerCase();
    if (t.includes("fam") || t.includes("love") || t.includes("mum") || t.includes("dad") || t.includes("child")) categoryBuckets["Family & Love"] += count;
    else if (t.includes("home") || t.includes("house") || t.includes("garden") || t.includes("kitchen")) categoryBuckets["Home & Belonging"] += count;
    else if (t.includes("work") || t.includes("career") || t.includes("project") || t.includes("craft")) categoryBuckets["Career & Craft"] += count;
    else if (t.includes("travel") || t.includes("trip") || t.includes("summer") || t.includes("advent")) categoryBuckets["Adventure"] += count;
    else categoryBuckets["Faith & Purpose"] += count;
  });

  const bucketTotal = Object.values(categoryBuckets).reduce((a, b) => a + b, 0) || 1;
  const colors = ["#4A3AFF", "#10B981", "#F59E0B", "#06B6D4", "#8B5CF6"];
  const lifeThemes = Object.entries(categoryBuckets).map(([name, count], i) => ({
    name,
    value: Math.max(5, Math.round((count / bucketTotal) * 100)),
    color: colors[i % colors.length],
  }));

  // 4. Word Cloud Data
  const wordCloud = sortedTags.slice(0, 15).map(([text, weight]) => ({
    text,
    weight: Math.min(32, Math.max(14, weight * 4 + 12)),
  }));

  // 5. People in Archive
  let peopleInArchive = [];
  const taggedIdsList = Object.keys(taggedUserCounts);
  if (taggedIdsList.length > 0) {
    try {
      const taggedDocs = await prisma.user.findMany({
        where: { id: { in: taggedIdsList } },
        select: { id: true, displayName: true, photoURL: true, email: true }
      });

      const bgs = ["bg-red-500", "bg-emerald-500", "bg-cyan-600", "bg-orange-500", "bg-purple-600", "bg-blue-600"];
      peopleInArchive = taggedDocs
        .sort((a, b) => (taggedUserCounts[b.id] || 0) - (taggedUserCounts[a.id] || 0))
        .map((u, idx) => {
          const count = taggedUserCounts[u.id] || 1;
          return {
            name: u.displayName || u.email?.split("@")[0] || "Family Member",
            avatar: u.photoURL || "",
            count: `${count} ${count === 1 ? "memory" : "memories"}`,
            bg: bgs[idx % bgs.length],
          };
        });
    } catch (_) {}
  }

  // Fallback to connected family members if no tagged user memories exist
  if (peopleInArchive.length === 0) {
    try {
      const connections = await prisma.familyConnection.findMany({
        where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
        take: 10,
      });
      const famUserIds = connections.map(c => c.user1Id === userId ? c.user2Id : c.user1Id).filter(Boolean);
      if (famUserIds.length > 0) {
        const famUsers = await prisma.user.findMany({
          where: { id: { in: famUserIds } },
          select: { id: true, displayName: true, photoURL: true, email: true }
        });
        const bgs = ["bg-[#4A3AFF]", "bg-indigo-600", "bg-purple-600", "bg-emerald-600", "bg-amber-600"];
        peopleInArchive = famUsers.map((u, idx) => ({
          name: u.displayName || u.email?.split("@")[0] || "Family Connection",
          avatar: u.photoURL || "",
          count: "Connected Family",
          bg: bgs[idx % bgs.length],
        }));
      }
    } catch (_) {}
  }

  // 6. Select Forgotten Memory
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const olderMemories = memories.filter((m) => new Date(m.occurredAt || m.createdAt) < ninetyDaysAgo);
  const forgottenMemory = olderMemories.length > 0 ? olderMemories[Math.floor(Math.random() * olderMemories.length)] : null;

  // 7. Life Summary Text
  const topCategory = lifeThemes.sort((a, b) => b.value - a.value)[0]?.name || "Family & Love";
  const lifeSummary = `You have captured ${totalMemories} memories spanning ${yearsCoveredCount} ${yearsCoveredCount === 1 ? "year" : "years"}. The strongest theme in your personal archive is ${topCategory}, representing your commitment to preserving authentic generational heritage.`;

  return {
    stats: {
      totalMemories,
      voiceHours: `${voiceHoursNum}h`,
      wordsWritten: wordsFormatted,
      milestones: milestoneCount,
      yearsCovered: yearsCoveredCount,
    },
    legacyScore,
    lifeSummary,
    lifeThemes,
    emotionalLandscape: monthlyMoods,
    wordCloud,
    peopleInArchive,
    insights: [
      {
        title: "Growth Journey",
        desc: `You have documented ${totalMemories} memories across your life archive. Your consistency in recording family history continues to strengthen your generational vault.`,
        icon: "TrendingUp",
        iconColor: "text-emerald-500",
      },
      forgottenMemory
        ? {
            title: "Rediscovered Memory",
            desc: `A memory from ${new Date(forgottenMemory.occurredAt || forgottenMemory.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}: "${forgottenMemory.title}".`,
            icon: "RotateCcw",
            iconColor: "text-blue-500",
          }
        : {
            title: "Consistency Peak",
            desc: `Your active recording period is growing with ${voiceMemoryCount} voice archives created so far.`,
            icon: "Star",
            iconColor: "text-orange-400",
          },
      {
        title: "Milestone Pattern",
        desc: `You have recorded ${milestoneCount} major life milestones across your journey.`,
        icon: "Star",
        iconColor: "text-amber-500",
      },
    ],
    forgottenMemory,
  };
}

module.exports = {
  getUserInsightsSummary,
};
