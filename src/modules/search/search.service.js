const prisma = require("../../config/prisma");
const memoryService = require("../memories/memory.service");
const albumService = require("../albums/album.service");
const { getSignedFileUrl } = require("../../services/s3.service");

const searchArchive = async ({ currentUser, q, type }) => {
  // Get family connections
  const connections = await prisma.familyConnection.findMany({
    where: {
      OR: [
        { user1Id: currentUser.id },
        { user2Id: currentUser.id }
      ]
    }
  });
  const familyUids = connections.map(c => c.user1Id === currentUser.id ? c.user2Id : c.user1Id);
  
  const cleanQuery = q ? q.trim() : "";

  const results = {
    memories: [],
    albums: [],
    people: []
  };

  // 1. Search Memories
  if (type === "all" || type === "memories") {
    const memories = await prisma.memory.findMany({
      where: {
        AND: [
          {
            OR: [
              { privacy: "Public", status: "published" },
              {
                privacy: { in: ["Family Circle", "Family"] },
                status: "published",
                ownerId: { in: [...familyUids, currentUser.id] }
              },
              { ownerId: currentUser.id }
            ]
          },
          cleanQuery ? {
            OR: [
              { title: { contains: cleanQuery, mode: "insensitive" } },
              { description: { contains: cleanQuery, mode: "insensitive" } },
              { mood: { contains: cleanQuery, mode: "insensitive" } },
              { tags: { hasSome: [cleanQuery] } }
            ]
          } : {}
        ]
      },
      orderBy: { occurredAt: "desc" },
      take: 100
    });

    results.memories = await Promise.all(
      memories.map(m => memoryService.serializeMemory(m, currentUser))
    );
  }

  // 2. Search Albums
  if (type === "all" || type === "albums") {
    const albums = await prisma.album.findMany({
      where: {
        AND: [
          {
            OR: [
              { privacy: "Public" },
              {
                privacy: "Family",
                ownerId: { in: [...familyUids, currentUser.id] }
              },
              { ownerId: currentUser.id }
            ]
          },
          cleanQuery ? {
            OR: [
              { title: { contains: cleanQuery, mode: "insensitive" } },
              { subtitle: { contains: cleanQuery, mode: "insensitive" } }
            ]
          } : {}
        ]
      },
      orderBy: { updatedAt: "desc" },
      take: 50
    });

    results.albums = await Promise.all(
      albums.map(a => albumService.serializeAlbum(a, currentUser))
    );
  }

  // 3. Search People (Users)
  if (type === "all" || type === "people") {
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: currentUser.id } }, // Exclude self
          cleanQuery ? {
            OR: [
              { displayName: { contains: cleanQuery, mode: "insensitive" } },
              { email: { contains: cleanQuery, mode: "insensitive" } },
              { profession: { contains: cleanQuery, mode: "insensitive" } },
              { bio: { contains: cleanQuery, mode: "insensitive" } },
              { location: { contains: cleanQuery, mode: "insensitive" } }
            ]
          } : {}
        ]
      },
      take: 50
    });

    results.people = await Promise.all(
      users.map(async (uDoc) => {
        let avatar = uDoc.photoURL || "";
        if (uDoc.photoKey) {
          try {
            avatar = await getSignedFileUrl(uDoc.photoKey);
          } catch (err) {
            console.warn("Failed to get signed URL for search user:", err.message);
          }
        }
        return {
          id: uDoc.id,
          name: uDoc.displayName || uDoc.email?.split("@")[0] || "Alexander Mitchell",
          role: uDoc.profession || "Family Contributor",
          location: uDoc.location || "Earth",
          bio: uDoc.bio || "",
          avatar: avatar,
          email: uDoc.email
        };
      })
    );
  }

  return results;
};

module.exports = {
  searchArchive
};
