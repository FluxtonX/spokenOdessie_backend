const express = require("express");
const { protect } = require("../../middlewares/auth.middleware");
const prisma = require("../../config/prisma");
const { getSignedFileUrl } = require("../../services/s3.service");

const router = express.Router();
const DAY = 24 * 60 * 60 * 1000;

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function memoryCategory(memory) {
  const tags = (memory.tags || []).map((tag) => String(tag).toLowerCase());
  const type = String(memory.type || "").toLowerCase();
  if (type === "milestone" || tags.includes("milestone")) return "milestones";
  if (["text", "written"].includes(type) || tags.some((tag) => ["reflection", "belief", "lesson"].includes(tag))) return "reflections";
  const mediaItems = Array.isArray(memory.mediaList) ? memory.mediaList : [];
  const hasVisualMedia = String(memory.mediaMimeType || "").startsWith("image/") || String(memory.mediaMimeType || "").startsWith("video/") || mediaItems.some((item) => /^(image|video)\//i.test(item?.mediaMimeType || item?.mimeType || ""));
  if (["photo", "video", "visual"].includes(type) || hasVisualMedia) return "photos";
  return "memories";
}

router.get("/compare", protect, async (req, res) => {
  try {
    const periods = ["then", "now"].map((key) => {
      const start = parseDate(req.query[`${key}Start`]);
      const end = parseDate(req.query[`${key}End`]);
      if (!start || !end || start > end) {
        const error = new Error(`Choose a valid start and end date for the ${key === "then" ? "Then" : "Now"} period.`);
        error.statusCode = 400;
        throw error;
      }
      return { key, start, end: new Date(end.getTime() + DAY) };
    });

    const result = {};
    for (const period of periods) {
      const memories = await prisma.memory.findMany({
        where: {
          ownerId: req.user.id,
          status: "published",
          occurredAt: { gte: period.start, lt: period.end },
        },
        select: {
          id: true, type: true, tags: true, taggedUserIds: true,
          places: true, occurredAt: true, mediaMimeType: true,
        },
        orderBy: { occurredAt: "desc" },
      });

      const personIds = new Set();
      const places = new Map();
      let milestones = 0;
      memories.forEach((memory) => {
        (memory.taggedUserIds || []).forEach((id) => {
          if (id && id !== req.user.id) personIds.add(id);
        });
        (memory.places || []).forEach((place) => {
          if (typeof place !== "string" || !place.trim()) return;
          const label = place.trim();
          if (!places.has(label.toLowerCase())) places.set(label.toLowerCase(), label);
        });
        if (memoryCategory(memory) === "milestones") milestones += 1;
      });

      const taggedIds = Array.from(personIds);
      const [people, familyMembers] = taggedIds.length ? await Promise.all([
        prisma.user.findMany({
          where: { OR: [{ id: { in: taggedIds } }, { googleId: { in: taggedIds } }, { email: { in: taggedIds } }] },
          select: { id: true, googleId: true, email: true, displayName: true, photoURL: true, photoKey: true, profession: true },
        }),
        prisma.familyMember.findMany({ where: { id: { in: taggedIds } }, include: { user: true } }),
      ]) : [[], []];
      const peopleById = new Map();
      people.forEach((person) => {
        [person.id, person.googleId, person.email].filter(Boolean).forEach((id) => peopleById.set(id, person));
      });
      familyMembers.forEach((member) => {
        if (member.id && member.user) peopleById.set(member.id, {
          ...member.user,
          profession: member.relationship || member.user.profession,
        });
      });

      const categoryCounts = memories.reduce((counts, memory) => {
        const category = memoryCategory(memory);
        counts[category] = (counts[category] || 0) + 1;
        return counts;
      }, {});
      const categorySamples = ["milestones", "reflections", "photos", "memories"]
        .map((category) => memories.filter((memory) => memoryCategory(memory) === category).slice(0, 10))
        .flat();
      const uniqueSamples = Array.from(new Map(categorySamples.map((memory) => [memory.id, memory])).values())
        .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
      const sampleDetails = uniqueSamples.length ? await prisma.memory.findMany({
        where: { ownerId: req.user.id, id: { in: uniqueSamples.map((memory) => memory.id) } },
        select: { id: true, title: true, description: true, mediaKey: true, thumbnailKey: true, mediaMimeType: true, mediaList: true },
      }) : [];
      const detailsById = new Map(sampleDetails.map((memory) => [memory.id, memory]));

      result[period.key] = {
        counts: {
          memories: memories.length,
          people: personIds.size,
          places: places.size,
          milestones,
          reflections: categoryCounts.reflections || 0,
          photos: categoryCounts.photos || 0,
        },
        people: await Promise.all(Array.from(personIds).map(async (id) => {
          const person = peopleById.get(id);
          const name = person?.displayName || person?.email?.split("@")[0] || "Family member";
          const avatar = person?.photoURL || (person?.photoKey ? await getSignedFileUrl(person.photoKey).catch(() => null) : null);
          return { id: person?.id || id, name, profession: person?.profession || "Connected person", avatar };
        })).then((list) => list.slice(0, 30)),
        places: Array.from(places.values()).slice(0, 30),
        memories: await Promise.all(uniqueSamples.map(async (memory) => {
          const detail = detailsById.get(memory.id) || {};
          let mediaItems = [];
          try {
            const parsed = typeof detail.mediaList === "string" ? JSON.parse(detail.mediaList) : detail.mediaList;
            if (Array.isArray(parsed)) mediaItems = parsed;
          } catch (_) {}
          const primaryMedia = detail.mediaKey ? {
            mediaKey: detail.mediaKey,
            thumbnailKey: detail.thumbnailKey,
            mediaMimeType: detail.mediaMimeType || "",
          } : (mediaItems[0] || null);
          return {
          id: memory.id,
          title: detail.title || "",
          description: detail.description || "",
          type: memory.type,
          mediaMimeType: primaryMedia?.mediaMimeType || detail.mediaMimeType || "",
          mediaUrl: primaryMedia?.mediaKey ? await getSignedFileUrl(primaryMedia.mediaKey).catch(() => null) : null,
          thumbnailUrl: primaryMedia?.thumbnailKey ? await getSignedFileUrl(primaryMedia.thumbnailKey).catch(() => null) : null,
          tags: memory.tags,
          occurredAt: memory.occurredAt,
          places: memory.places || [],
          category: memoryCategory(memory),
          };
        })),
      };
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || "Unable to compare these periods." });
  }
});

module.exports = router;
