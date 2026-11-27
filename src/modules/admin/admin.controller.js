const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const prisma = require("../../config/prisma");
const firebaseAdmin = require("../../config/firebase");
const { s3, s3BucketName } = require("../../config/aws");
const { sendNotificationEmail } = require("../../services/email.service");
const { RESTRICTION_STATUSES, getEffectiveRestriction, refreshExpiredRestriction } = require("../../services/adminAccountRestrictions.service");

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

const auditAdminAction = (tx, req, action, metadata) => tx.securityAuditLog.create({
  data: {
    action,
    ipAddress: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim().slice(0, 100) || null,
    userAgent: String(req.headers["user-agent"] || "").slice(0, 300) || null,
    metadata: { adminEmail: req.admin.email, ...metadata },
  },
});

const parsePagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25));
  return { page, limit };
};

const publicPrivacyFilter = () => ({ privacy: { equals: "Public", mode: "insensitive" } });
const isPublicPrivacy = (privacy) => String(privacy || "").trim().toLowerCase() === "public";

const escapeHtml = (value) => String(value || "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);

const getAdminMediaUrl = async (key) => {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  if (!s3BucketName) throw new Error("Media storage is not configured for admin review.");
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: s3BucketName, Key: key, ResponseContentDisposition: "inline" }), { expiresIn: 300 });
};

const sendUserNoticeEmail = ({ email, subject, title, message }) => {
  if (!email) return;
  const clientUrl = String(process.env.CLIENT_URL || "https://spokenodyssey.com").split(",")[0].trim().replace(/\/$/, "");
  sendNotificationEmail({ toEmail: email, subject, title, message: escapeHtml(message), actionUrl: `${clientUrl}/notifications` })
    .catch((error) => console.error("Admin notification email failed:", error.message));
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
      prisma.user.count({ where: { isActive: true, lastActive: { gte: activeSince } } }),
      prisma.familyCircle.count(),
      prisma.familyMember.count({ where: { status: "ACTIVE" } }),
      prisma.memory.count(),
      prisma.familyMemoryLink.count(),
      prisma.memory.groupBy({ by: ["type"], _count: { _all: true } }),
      prisma.mediaAsset.groupBy({ by: ["mimeType"], where: { memory: { is: publicPrivacyFilter() } }, _count: { _all: true } }),
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
        role: true, isActive: true, adminRestriction: true, adminRestrictionReason: true, adminRestrictionEndsAt: true, adminRestrictionUpdatedAt: true, createdAt: true, lastLogin: true, lastActive: true,
        familyMemberships: { where: { status: "ACTIVE" }, select: { id: true, role: true, relationship: true, joinedAt: true, familyCircle: { select: { id: true, name: true } } } },
        _count: { select: { memories: true, familyMemberships: true } },
      },
    });
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    const currentUser = await refreshExpiredRestriction(user);

    const [typeRows, recentPosts, restrictionHistory] = await Promise.all([
      prisma.memory.groupBy({ by: ["type"], where: { ownerId: user.id }, _count: { _all: true } }),
      prisma.memory.findMany({ where: { ownerId: user.id, ...publicPrivacyFilter() }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, title: true, type: true, status: true, createdAt: true } }),
      prisma.securityAuditLog.findMany({
        where: { action: "ADMIN_USER_RESTRICTION_CHANGED", metadata: { path: ["targetUserId"], equals: user.id } },
        orderBy: { createdAt: "desc" }, take: 20,
        select: { id: true, action: true, metadata: true, createdAt: true },
      }),
    ]);
    const postTypes = emptyPostTypes();
    for (const row of typeRows) postTypes[postCategory(row.type)] += row._count._all;
    res.json({ success: true, data: { ...currentUser, restrictionStatus: getEffectiveRestriction(currentUser), postTypes, recentPosts, restrictionHistory } });
  } catch (error) { next(error); }
};

const getContentDetails = async (req, res, next) => {
  try {
    const memory = await prisma.memory.findFirst({
      where: { id: req.params.id, ...publicPrivacyFilter() },
      select: {
        id: true, title: true, description: true, tags: true, type: true, status: true, privacy: true,
        mood: true, occurredAt: true, createdAt: true, updatedAt: true, isVaultLocked: true, unlockAt: true,
        mediaKey: true, thumbnailKey: true, mediaMimeType: true, mediaOriginalName: true, mediaList: true,
        owner: { select: { id: true, displayName: true, email: true } },
        mediaAssets: { orderBy: { orderIndex: "asc" }, select: { id: true, storageKey: true, thumbnailKey: true, originalName: true, mimeType: true, fileSize: true, durationSec: true, transcriptText: true, transcriptStatus: true } },
        storyLayers: { orderBy: { createdAt: "asc" }, select: { id: true, text: true, audioKey: true, audioDuration: true, transcriptText: true, transcriptStatus: true, createdAt: true, author: { select: { displayName: true, email: true } } } },
      },
    });
    if (!memory) return res.status(404).json({ success: false, message: "Public post not found." });

    await auditAdminAction(prisma, req, "ADMIN_CONTENT_VIEWED", {
      memoryId: memory.id, title: memory.title, ownerId: memory.owner.id,
      privacy: memory.privacy, isVaultLocked: memory.isVaultLocked,
    });

    let mediaList = memory.mediaList;
    if (typeof mediaList === "string") {
      try { mediaList = JSON.parse(mediaList); } catch { mediaList = []; }
    }
    if (!Array.isArray(mediaList)) mediaList = [];
    const seen = new Set();
    const media = [];
    const addMedia = async (item, fallback = {}) => {
      const key = item.storageKey || item.mediaKey || item.key || item.url || item.mediaUrl;
      if (!key || typeof key !== "string" || key.startsWith("data:" ) || seen.has(key)) return;
      seen.add(key);
      const thumbnailKey = item.thumbnailKey || item.thumbnailUrl || null;
      media.push({
        id: item.id || `${memory.id}-${media.length + 1}`,
        originalName: item.originalName || item.mediaOriginalName || fallback.originalName || "Media file",
        mimeType: item.mimeType || item.mediaMimeType || fallback.mimeType || "application/octet-stream",
        fileSize: item.fileSize || 0,
        durationSec: item.durationSec || null,
        url: await getAdminMediaUrl(key),
        thumbnailUrl: thumbnailKey ? await getAdminMediaUrl(thumbnailKey) : null,
        transcriptText: item.transcriptText || null,
      });
    };
    for (const asset of memory.mediaAssets) await addMedia(asset);
    for (const item of mediaList) await addMedia(item);
    if (memory.mediaKey) await addMedia({ mediaKey: memory.mediaKey, thumbnailKey: memory.thumbnailKey, mediaMimeType: memory.mediaMimeType, mediaOriginalName: memory.mediaOriginalName });

    const storyLayers = await Promise.all(memory.storyLayers.map(async (layer) => ({
      ...layer,
      audioUrl: layer.audioKey ? await getAdminMediaUrl(layer.audioKey) : null,
      audioKey: undefined,
    })));
    return res.json({ success: true, data: { ...memory, mediaKey: undefined, thumbnailKey: undefined, mediaAssets: undefined, mediaList: media, storyLayers } });
  } catch (error) { return next(error); }
};

const getFamilyDetails = async (req, res, next) => {
  try {
    const family = await prisma.familyCircle.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, name: true, description: true, createdAt: true, updatedAt: true,
        createdBy: { select: { id: true, displayName: true, email: true } },
        members: { orderBy: { joinedAt: "asc" }, select: { id: true, role: true, status: true, relationship: true, joinedAt: true, user: { select: { id: true, displayName: true, email: true, photoURL: true, createdAt: true, _count: { select: { memories: true } } } } } },
        invitations: { orderBy: { createdAt: "desc" }, take: 30, select: { id: true, email: true, phoneNumber: true, relationship: true, method: true, status: true, createdAt: true, expiresAt: true } },
        memoryLinks: { where: { memory: { is: publicPrivacyFilter() } }, orderBy: { occurredAt: "desc" }, take: 20, select: { id: true, occurredAt: true, createdAt: true, memory: { select: { id: true, title: true, type: true, status: true, owner: { select: { id: true, displayName: true, email: true } } } } } },
        _count: { select: { members: { where: { status: "ACTIVE" } }, memoryLinks: true } },
      },
    });
    if (!family) return res.status(404).json({ success: false, message: "Family circle not found." });
    const familyTypeRows = await prisma.$queryRaw`SELECT m."type" AS type, COUNT(*)::int AS count FROM family_memory_links fml JOIN "Memory" m ON m."id" = fml."memoryId" WHERE fml."familyCircleId" = ${family.id} GROUP BY m."type"`;
    const postTypes = emptyPostTypes();
    for (const row of familyTypeRows) postTypes[postCategory(row.type)] += row.count;
    const adminHistory = await prisma.securityAuditLog.findMany({
      where: { action: "ADMIN_FAMILY_INVITATION_REVOKED", metadata: { path: ["familyCircleId"], equals: family.id } },
      orderBy: { createdAt: "desc" }, take: 20,
      select: { id: true, action: true, metadata: true, createdAt: true },
    });
    res.json({ success: true, data: { ...family, postTypes, adminHistory } });
  } catch (error) { next(error); }
};

const getUsers = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const search = String(req.query.search || "").trim();
    const familyFilter = req.query.family === "joined" ? "joined" : req.query.family === "none" ? "none" : "all";
    const activityFilter = req.query.activity === "active30" ? "active30" : "all";
    const sort = ["oldest", "name", "active"].includes(req.query.sort) ? req.query.sort : "recent";
    const activeSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const where = {
      ...(activityFilter === "active30" ? { isActive: true, lastActive: { gte: activeSince } } : {}),
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
        select: { id: true, email: true, displayName: true, photoURL: true, role: true, isActive: true, adminRestriction: true, adminRestrictionReason: true, adminRestrictionEndsAt: true, adminRestrictionUpdatedAt: true, createdAt: true, lastLogin: true, lastActive: true,
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
    const currentUsers = await Promise.all(users.map(refreshExpiredRestriction));
    const results = currentUsers.map((user) => ({ ...user, restrictionStatus: getEffectiveRestriction(user), postTypes: typesByUser.get(user.id) }));
    res.json({ success: true, data: results, filters: { activity: activityFilter }, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
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

const updateUserStatus = async (req, res, next) => {
  try {
    let { status, active, endsAt, reason } = req.body || {};
    const normalizedReason = String(reason || "").trim();
    if (!status && typeof active === "boolean") status = active ? "NONE" : "PERMANENTLY_SUSPENDED";
    status = String(status || "").toUpperCase();
    if (!RESTRICTION_STATUSES.has(status) || normalizedReason.length < 3 || normalizedReason.length > 500) {
      return res.status(400).json({ success: false, message: "Choose an access status and provide a reason (3–500 characters)." });
    }
    const endsAtDate = status === "TEMPORARY_SUSPENDED" ? new Date(endsAt) : null;
    if (status === "TEMPORARY_SUSPENDED" && (!endsAt || Number.isNaN(endsAtDate.getTime()) || endsAtDate <= new Date() || endsAtDate > new Date(Date.now() + 365 * 24 * 60 * 60 * 1000))) {
      return res.status(400).json({ success: false, message: "Set a future suspension end date within the next 365 days." });
    }
    let user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    user = await refreshExpiredRestriction(user);
    if (user.email.toLowerCase() === configuredAdminEmail()) {
      return res.status(409).json({ success: false, message: "The configured administrator account cannot be changed here." });
    }
    const previousStatus = getEffectiveRestriction(user);
    if (previousStatus === status && (status === "NONE" || user.adminRestrictionReason === normalizedReason) && (status !== "TEMPORARY_SUSPENDED" || new Date(user.adminRestrictionEndsAt).getTime() === endsAtDate.getTime())) {
      return res.json({ success: true, data: { id: user.id, isActive: user.isActive, restrictionStatus: previousStatus, adminRestrictionEndsAt: user.adminRestrictionEndsAt } });
    }
    const now = new Date();
    const isActive = !["TEMPORARY_SUSPENDED", "PERMANENTLY_SUSPENDED"].includes(status);
    const title = status === "NONE" ? "Account access restored" : status === "POSTING_RESTRICTED" ? "Posting access restricted" : status === "TEMPORARY_SUSPENDED" ? "Account temporarily suspended" : "Account permanently suspended";
    const userMessage = status === "NONE"
      ? `Your account access has been restored. Reason: ${normalizedReason}`
      : status === "POSTING_RESTRICTED"
        ? `Your account can still be used to view content, but posting and sharing have been restricted. Reason: ${normalizedReason}`
        : `Your Spoken Odyssey account has been suspended${status === "TEMPORARY_SUSPENDED" ? ` until ${endsAtDate.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC` : ""}. Reason: ${normalizedReason}`;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.update({ where: { id: user.id }, data: {
        isActive, adminRestriction: status, adminRestrictionReason: status === "NONE" ? null : normalizedReason,
        adminRestrictionEndsAt: endsAtDate, adminRestrictionUpdatedAt: now,
      }, select: { id: true, email: true, isActive: true, adminRestriction: true, adminRestrictionReason: true, adminRestrictionEndsAt: true, adminRestrictionUpdatedAt: true, googleId: true } });
      if (!isActive) await tx.userSession.deleteMany({ where: { userId: user.id } });
      await auditAdminAction(tx, req, "ADMIN_USER_RESTRICTION_CHANGED", {
        targetUserId: user.id, targetEmail: user.email, previousStatus, status,
        endsAt: endsAtDate?.toISOString() || null, reason: normalizedReason,
      });
      await tx.notification.create({ data: {
        userId: user.id, type: "ADMIN_ACCOUNT_RESTRICTION", title, message: userMessage,
        actionUrl: "/notifications", metadata: { restrictionStatus: status, endsAt: endsAtDate?.toISOString() || null },
      } });
      return result;
    });
    let firebaseAuthSynced = null;
    const firebaseUid = updated.googleId;
    if (firebaseUid && firebaseAdmin.apps.length) {
      try {
        if (status === "PERMANENTLY_SUSPENDED") await firebaseAdmin.auth().updateUser(firebaseUid, { disabled: true });
        else if (previousStatus === "PERMANENTLY_SUSPENDED") await firebaseAdmin.auth().updateUser(firebaseUid, { disabled: false });
        if (["TEMPORARY_SUSPENDED", "PERMANENTLY_SUSPENDED"].includes(status) || ["TEMPORARY_SUSPENDED", "PERMANENTLY_SUSPENDED"].includes(previousStatus)) {
          await firebaseAdmin.auth().revokeRefreshTokens(firebaseUid);
        }
        firebaseAuthSynced = true;
      } catch (error) {
        firebaseAuthSynced = false;
        console.error("Could not synchronize Firebase account restriction:", error.message);
      }
    }
    sendUserNoticeEmail({ email: user.email, subject: "Spoken Odyssey account access update", title, message: userMessage });
    const safeUpdated = { ...updated };
    delete safeUpdated.googleId;
    return res.json({ success: true, data: { ...safeUpdated, restrictionStatus: status, firebaseAuthSynced } });
  } catch (error) { return next(error); }
};

const getContent = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "all").trim().toLowerCase();
    const type = String(req.query.type || "all").trim();
    if (!new Set(["all", "draft", "published", "archived", "removed"]).has(status)) {
      return res.status(400).json({ success: false, message: "Unsupported post status filter." });
    }
    const where = {
      ...publicPrivacyFilter(),
      ...(status !== "all" ? { status } : {}),
      ...(type !== "all" ? { type: { equals: type, mode: "insensitive" } } : {}),
      ...(search ? { OR: [
        { title: { contains: search, mode: "insensitive" } },
        { owner: { email: { contains: search, mode: "insensitive" } } },
        { owner: { displayName: { contains: search, mode: "insensitive" } } },
      ] } : {}),
    };
    const [total, memories, publicPostCount, privateAndFamilyPostCount] = await Promise.all([
      prisma.memory.count({ where }),
      prisma.memory.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
        select: {
          id: true, title: true, type: true, status: true, privacy: true, createdAt: true, updatedAt: true,
          owner: { select: { id: true, displayName: true, email: true } },
          _count: { select: { mediaAssets: true, comments: true } },
        },
      }),
      prisma.memory.count({ where: publicPrivacyFilter() }),
      prisma.memory.count({ where: { NOT: publicPrivacyFilter() } }),
    ]);
    return res.json({
      success: true,
      data: memories,
      summary: { publicPosts: publicPostCount, privateAndFamilyPosts: privateAndFamilyPostCount },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) { return next(error); }
};

const updateContentStatus = async (req, res, next) => {
  try {
    const action = String(req.body?.action || "");
    const reason = String(req.body?.reason || "").trim();
    if (!["remove", "restore"].includes(action) || reason.length < 3 || reason.length > 500) {
      return res.status(400).json({ success: false, message: "Choose remove or restore and provide a reason (3–500 characters)." });
    }
    const memory = await prisma.memory.findFirst({ where: { id: req.params.id, ...publicPrivacyFilter() }, select: { id: true, status: true, title: true, ownerId: true, owner: { select: { email: true } } } });
    if (!memory) return res.status(404).json({ success: false, message: "Public post not found." });
    let nextStatus;
    if (action === "remove") {
      if (["archived", "removed"].includes(memory.status)) return res.status(409).json({ success: false, message: "This post is already removed or archived." });
      nextStatus = "removed";
    } else {
      if (!["removed", "archived"].includes(memory.status)) return res.status(409).json({ success: false, message: "This post has not been removed." });
      const priorAction = await prisma.securityAuditLog.findFirst({
        where: { action: memory.status === "removed" ? "ADMIN_CONTENT_REMOVED" : "ADMIN_CONTENT_ARCHIVED", metadata: { path: ["memoryId"], equals: memory.id } },
        orderBy: { createdAt: "desc" }, select: { metadata: true },
      });
      nextStatus = priorAction?.metadata?.previousStatus;
      if (typeof nextStatus !== "string" || ["archived", "removed"].includes(nextStatus)) {
        return res.status(409).json({ success: false, message: "The original post status could not be recovered, so it cannot be restored safely." });
      }
    }
    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.memory.updateMany({
        where: { id: memory.id, status: memory.status, ...publicPrivacyFilter() },
        data: { status: nextStatus },
      });
      if (changed.count !== 1) {
        const error = new Error("Only public posts can be changed by admin moderation.");
        error.statusCode = 404;
        throw error;
      }
      const result = await tx.memory.findUnique({ where: { id: memory.id }, select: { id: true, title: true, status: true } });
      const auditAction = action === "restore" ? "ADMIN_CONTENT_RESTORED" : "ADMIN_CONTENT_REMOVED";
      await auditAdminAction(tx, req, auditAction, {
        memoryId: memory.id, title: memory.title, ownerId: memory.ownerId,
        previousStatus: memory.status, status: nextStatus, reason,
      });
      if (action === "remove") {
        const notificationMessage = `Your post “${memory.title || "Untitled post"}” was removed by an administrator. Reason: ${reason}`;
        await tx.notification.create({ data: {
          userId: memory.ownerId, type: "ADMIN_CONTENT_REMOVED", title: "A post was removed",
          message: notificationMessage, actionUrl: "/notifications", metadata: { memoryId: memory.id, reason },
        } });
      }
      return result;
    });
    if (action === "remove") {
      sendUserNoticeEmail({
        email: memory.owner.email, subject: "Spoken Odyssey post removal notice",
        title: "A post was removed", message: `Your post “${memory.title || "Untitled post"}” was removed by an administrator. Reason: ${reason}`,
      });
    }
    return res.json({ success: true, data: updated });
  } catch (error) { return next(error); }
};

const updateFamilyInvitation = async (req, res, next) => {
  try {
    const action = String(req.body?.action || "");
    const reason = String(req.body?.reason || "").trim();
    if (action !== "revoke" || reason.length < 3 || reason.length > 500) {
      return res.status(400).json({ success: false, message: "Choose revoke and provide a reason (3–500 characters)." });
    }
    const invitation = await prisma.familyInvitation.findFirst({
      where: { id: req.params.invitationId, familyCircleId: req.params.familyId },
      select: { id: true, status: true, email: true, receiverId: true },
    });
    if (!invitation) return res.status(404).json({ success: false, message: "Invitation not found." });
    if (!["PENDING", "ACCEPTED"].includes(invitation.status)) {
      return res.status(409).json({ success: false, message: "Only pending invitations can be revoked." });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.familyInvitation.update({ where: { id: invitation.id }, data: { status: "REVOKED" }, select: { id: true, status: true } });
      await auditAdminAction(tx, req, "ADMIN_FAMILY_INVITATION_REVOKED", {
        familyCircleId: req.params.familyId, invitationId: invitation.id, previousStatus: invitation.status,
        email: invitation.email, receiverId: invitation.receiverId, reason,
      });
      return result;
    });
    return res.json({ success: true, data: updated });
  } catch (error) { return next(error); }
};

const getAdminActivity = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const actionValues = new Map([
      ["user_restriction", "ADMIN_USER_RESTRICTION_CHANGED"],
      ["content_removed", "ADMIN_CONTENT_REMOVED"],
      ["content_restored", "ADMIN_CONTENT_RESTORED"],
      ["content_viewed", "ADMIN_CONTENT_VIEWED"],
      ["family_invitation", "ADMIN_FAMILY_INVITATION_REVOKED"],
    ]);
    const actionFilter = String(req.query.action || "all");
    if (actionFilter !== "all" && !actionValues.has(actionFilter)) {
      return res.status(400).json({ success: false, message: "Unsupported activity action filter." });
    }
    const from = req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : null;
    const to = req.query.to ? new Date(`${req.query.to}T00:00:00.000Z`) : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to)) {
      return res.status(400).json({ success: false, message: "Choose a valid activity date range." });
    }
    const toExclusive = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : null;
    const search = String(req.query.search || "").trim().slice(0, 120);
    const where = {
      action: actionFilter === "all" ? { startsWith: "ADMIN_" } : actionValues.get(actionFilter),
      ...(from || toExclusive ? { createdAt: { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } } : {}),
      ...(search ? { OR: [
        { metadata: { path: ["adminEmail"], string_contains: search } },
        { metadata: { path: ["targetEmail"], string_contains: search } },
        { metadata: { path: ["email"], string_contains: search } },
        { metadata: { path: ["title"], string_contains: search } },
        { metadata: { path: ["reason"], string_contains: search } },
      ] } : {}),
    };
    const [total, entries] = await Promise.all([
      prisma.securityAuditLog.count({ where }),
      prisma.securityAuditLog.findMany({
        where, orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit, take: limit,
        select: { id: true, action: true, ipAddress: true, userAgent: true, metadata: true, createdAt: true },
      }),
    ]);
    const contentActions = new Set(["ADMIN_CONTENT_VIEWED", "ADMIN_CONTENT_REMOVED", "ADMIN_CONTENT_RESTORED"]);
    const contentIds = [...new Set(entries
      .filter((entry) => contentActions.has(entry.action) && typeof entry.metadata?.memoryId === "string")
      .map((entry) => entry.metadata.memoryId))];
    const contentPrivacyRows = contentIds.length ? await prisma.memory.findMany({
      where: { id: { in: contentIds } }, select: { id: true, privacy: true },
    }) : [];
    const contentPrivacyById = new Map(contentPrivacyRows.map((memory) => [memory.id, memory.privacy]));
    const safeEntries = entries.filter((entry) => {
      if (!contentActions.has(entry.action)) return true;
      const privacy = contentPrivacyById.get(entry.metadata?.memoryId);
      return isPublicPrivacy(privacy);
    });
    return res.json({ success: true, data: safeEntries, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { return next(error); }
};

module.exports = { login, getCurrentAdmin, logout, getOverview, getUsers, getFamilies, getUserDetails, getFamilyDetails, updateUserStatus, getContent, getContentDetails, updateContentStatus, updateFamilyInvitation, getAdminActivity };
