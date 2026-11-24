const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const prisma = require("../../config/prisma");

const configuredAdminEmail = () => String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const configuredAdminPassword = () => String(process.env.ADMIN_PASSWORD || "");
const passwordVersion = () => crypto.createHash("sha256").update(configuredAdminPassword()).digest("hex");
const emptyPostTypes = () => ({ image: 0, voice: 0, video: 0, text: 0, other: 0 });
const postCategory = (value) => {
  const type = String(value || "").toLowerCase();
  if (type.includes("image") || type.includes("photo")) return "image";
  if (type.includes("voice") || type.includes("audio")) return "voice";
  if (type.includes("video")) return "video";
  if (type.includes("text") || type.includes("milestone")) return "text";
  return "other";
};

const login = async (req, res, next) => {
  try {
    const adminEmail = configuredAdminEmail();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!adminEmail || !configuredAdminPassword() || !process.env.JWT_SECRET) {
      return res.status(503).json({ success: false, message: "Admin sign-in is not fully configured on the server." });
    }
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }
    if (email !== adminEmail) {
      return res.status(401).json({ success: false, message: "Invalid admin credentials." });
    }

    const providedPasswordHash = crypto.createHash("sha256").update(password).digest();
    const expectedPasswordHash = crypto.createHash("sha256").update(configuredAdminPassword()).digest();
    if (!crypto.timingSafeEqual(providedPasswordHash, expectedPasswordHash)) {
      return res.status(401).json({ success: false, message: "Invalid admin credentials." });
    }

    const token = jwt.sign(
      { type: "ADMIN_SESSION", email: adminEmail, passwordVersion: passwordVersion(), jti: crypto.randomUUID() },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    return res.json({ success: true, token, data: { email: adminEmail, displayName: "Administrator", role: "ADMIN" } });
  } catch (error) {
    return next(error);
  }
};

const getCurrentAdmin = async (req, res) => {
  res.json({ success: true, data: { email: req.admin.email, displayName: "Administrator", role: "ADMIN" } });
};

const logout = async (req, res, next) => {
  try {
    res.json({ success: true });
  } catch (error) { next(error); }
};

const getOverview = async (req, res, next) => {
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const priorMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const period = req.query.period === "30d" ? "30d" : "12m";
    const start = period === "30d"
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    const grain = period === "30d" ? "day" : "month";
    const dateFormat = period === "30d" ? "YYYY-MM-DD" : "YYYY-MM";
    const activeSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalUsers, usersThisMonth, usersPreviousMonth, usersInPeriod, activeUsers30Days, totalFamilies, activeMemberships, totalPosts, totalFamilyPosts, postTypes, mediaTypes, userMonthly, familyMonthly] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.user.count({ where: { createdAt: { gte: priorMonthStart, lt: monthStart } } }),
      prisma.user.count({ where: { createdAt: { gte: start } } }),
      prisma.user.count({ where: { lastActive: { gte: activeSince } } }),
      prisma.familyCircle.count(),
      prisma.familyMember.count({ where: { status: "ACTIVE" } }),
      prisma.memory.count(),
      prisma.familyMemoryLink.count(),
      prisma.memory.groupBy({ by: ["type"], _count: { _all: true } }),
      prisma.mediaAsset.groupBy({ by: ["mimeType"], _count: { _all: true } }),
      prisma.$queryRaw`SELECT to_char(date_trunc(${grain}, "createdAt"), ${dateFormat}) AS bucket, COUNT(*)::int AS count FROM "User" WHERE "createdAt" >= ${start} GROUP BY 1`,
      prisma.$queryRaw`SELECT to_char(date_trunc(${grain}, "createdAt"), ${dateFormat}) AS bucket, COUNT(*)::int AS count FROM "FamilyCircle" WHERE "createdAt" >= ${start} GROUP BY 1`,
    ]);

    const buckets = new Map();
    const bucketCount = period === "30d" ? 30 : 12;
    for (let offset = 0; offset < bucketCount; offset += 1) {
      const date = period === "30d"
        ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + offset))
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + offset, 1));
      const key = period === "30d"
        ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
        : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, { bucket: key, users: 0, families: 0 });
    }
    for (const row of userMonthly) if (buckets.has(row.bucket)) buckets.get(row.bucket).users = row.count;
    for (const row of familyMonthly) if (buckets.has(row.bucket)) buckets.get(row.bucket).families = row.count;

    res.json({ success: true, data: {
      users: { total: totalUsers, thisMonth: usersThisMonth, previousMonth: usersPreviousMonth, inPeriod: usersInPeriod, activeLast30Days: activeUsers30Days },
      families: { total: totalFamilies, activeMemberships, familyPosts: totalFamilyPosts },
      posts: { total: totalPosts, byType: postTypes.map((row) => ({ type: row.type || "Unspecified", count: row._count._all })) },
      mediaAssets: { total: mediaTypes.reduce((sum, row) => sum + row._count._all, 0), byMimeType: mediaTypes.map((row) => ({ mimeType: row.mimeType || "Unspecified", count: row._count._all })) },
      period,
      monthly: Array.from(buckets.values()),
      generatedAt: now.toISOString(),
    } });
  } catch (error) {
    next(error);
  }
};

const getUserDetails = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, email: true, displayName: true, photoURL: true, bio: true, profession: true, location: true,
        role: true, isActive: true, createdAt: true, lastLogin: true, lastActive: true,
        familyMemberships: { where: { status: "ACTIVE" }, select: { id: true, role: true, relationship: true, joinedAt: true, familyCircle: { select: { id: true, name: true } } } },
        _count: { select: { memories: true, familyMemberships: true } },
      },
    });
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const [typeRows, recentPosts] = await Promise.all([
      prisma.memory.groupBy({ by: ["type"], where: { ownerId: user.id }, _count: { _all: true } }),
      prisma.memory.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, title: true, type: true, status: true, createdAt: true } }),
    ]);
    const postTypes = emptyPostTypes();
    for (const row of typeRows) postTypes[postCategory(row.type)] += row._count._all;
    res.json({ success: true, data: { ...user, postTypes, recentPosts } });
  } catch (error) { next(error); }
};

const getFamilyDetails = async (req, res, next) => {
  try {
    const family = await prisma.familyCircle.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, name: true, description: true, createdAt: true, updatedAt: true,
        createdBy: { select: { id: true, displayName: true, email: true } },
        members: { orderBy: { joinedAt: "asc" }, select: { id: true, role: true, status: true, relationship: true, joinedAt: true, user: { select: { id: true, displayName: true, email: true, photoURL: true, createdAt: true, _count: { select: { memories: true } } } } } },
        memoryLinks: { orderBy: { occurredAt: "desc" }, take: 20, select: { id: true, occurredAt: true, createdAt: true, memory: { select: { id: true, title: true, type: true, status: true, owner: { select: { id: true, displayName: true, email: true } } } } } },
        _count: { select: { members: { where: { status: "ACTIVE" } }, memoryLinks: true } },
      },
    });
    if (!family) return res.status(404).json({ success: false, message: "Family circle not found." });
    const familyTypeRows = await prisma.$queryRaw`SELECT m."type" AS type, COUNT(*)::int AS count FROM family_memory_links fml JOIN "Memory" m ON m."id" = fml."memoryId" WHERE fml."familyCircleId" = ${family.id} GROUP BY m."type"`;
    const postTypes = emptyPostTypes();
    for (const row of familyTypeRows) postTypes[postCategory(row.type)] += row.count;
    res.json({ success: true, data: { ...family, postTypes } });
  } catch (error) { next(error); }
};

const getUsers = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const search = String(req.query.search || "").trim();
    const familyFilter = req.query.family === "joined" ? "joined" : req.query.family === "none" ? "none" : "all";
    const sort = ["oldest", "name", "active"].includes(req.query.sort) ? req.query.sort : "recent";
    const where = {
      ...(search ? { OR: [
      { email: { contains: search, mode: "insensitive" } },
      { displayName: { contains: search, mode: "insensitive" } },
      ] } : {}),
      ...(familyFilter === "joined" ? { familyMemberships: { some: { status: "ACTIVE" } } } : {}),
      ...(familyFilter === "none" ? { familyMemberships: { none: { status: "ACTIVE" } } } : {}),
    };
    const orderBy = sort === "oldest" ? { createdAt: "asc" } : sort === "name" ? { displayName: "asc" } : sort === "active" ? { lastActive: "desc" } : { createdAt: "desc" };
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit,
        select: { id: true, email: true, displayName: true, photoURL: true, role: true, isActive: true, createdAt: true, lastLogin: true, lastActive: true,
          familyMemberships: { where: { status: "ACTIVE" }, select: { role: true, familyCircle: { select: { id: true, name: true } } } },
          _count: { select: { memories: true, familyMemberships: true } } },
      }),
    ]);
    const typeRows = users.length ? await prisma.memory.groupBy({
      by: ["ownerId", "type"],
      where: { ownerId: { in: users.map((user) => user.id) } },
      _count: { _all: true },
    }) : [];
    const typesByUser = new Map(users.map((user) => [user.id, emptyPostTypes()]));
    for (const row of typeRows) {
      const counts = typesByUser.get(row.ownerId);
      if (counts) counts[postCategory(row.type)] += row._count._all;
    }
    const results = users.map((user) => ({ ...user, postTypes: typesByUser.get(user.id) }));
    res.json({ success: true, data: results, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

const getFamilies = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const search = String(req.query.search || "").trim();
    const sort = ["oldest", "name", "members"].includes(req.query.sort) ? req.query.sort : "recent";
    const where = search ? { name: { contains: search, mode: "insensitive" } } : {};
    const orderBy = sort === "oldest" ? { createdAt: "asc" } : sort === "name" ? { name: "asc" } : sort === "members" ? { members: { _count: "desc" } } : { createdAt: "desc" };
    const [total, families] = await Promise.all([
      prisma.familyCircle.count({ where }),
      prisma.familyCircle.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit,
        select: { id: true, name: true, description: true, createdAt: true,
          createdBy: { select: { id: true, displayName: true, email: true } },
          _count: { select: { members: { where: { status: "ACTIVE" } }, memoryLinks: true } },
        },
      }),
    ]);
    const familyIds = families.map((family) => family.id);
    const links = familyIds.length ? await prisma.familyMemoryLink.findMany({
      where: { familyCircleId: { in: familyIds } },
      select: { familyCircleId: true, memory: { select: { type: true } } },
    }) : [];
    const typesByFamily = new Map(familyIds.map((id) => [id, emptyPostTypes()]));
    for (const link of links) {
      const counts = typesByFamily.get(link.familyCircleId);
      if (counts) counts[postCategory(link.memory.type)] += 1;
    }
    const results = families.map((family) => ({ ...family, postTypes: typesByFamily.get(family.id) }));
    res.json({ success: true, data: results, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

module.exports = { login, getCurrentAdmin, logout, getOverview, getUsers, getFamilies, getUserDetails, getFamilyDetails };
