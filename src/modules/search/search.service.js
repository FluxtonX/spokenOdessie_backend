const User = require("../user/user.model");
const Memory = require("../memories/memory.model");
const Album = require("../albums/album.model");
const memoryService = require("../memories/memory.service");
const albumService = require("../albums/album.service");

const searchArchive = async ({ currentUser, q, type }) => {
  const currentUserDoc = await User.findOne({ firebaseUid: currentUser.uid });
  const familyUids = currentUserDoc ? currentUserDoc.familyMembers || [] : [];
  
  const cleanQuery = q ? q.trim() : "";
  const regex = cleanQuery ? new RegExp(cleanQuery, "i") : null;

  const results = {
    memories: [],
    albums: [],
    people: []
  };

  // 1. Search Memories
  if (type === "all" || type === "memories") {
    const privacyCondition = {
      $or: [
        { privacy: "Public", status: "published" },
        {
          privacy: { $in: ["Family Circle", "Family"] },
          status: "published",
          ownerFirebaseUid: { $in: [...familyUids, currentUser.uid] }
        },
        { ownerFirebaseUid: currentUser.uid }
      ]
    };

    let query = privacyCondition;
    if (regex) {
      query = {
        $and: [
          privacyCondition,
          {
            $or: [
              { title: regex },
              { description: regex },
              { tags: { $in: [regex] } },
              { mood: regex }
            ]
          }
        ]
      };
    }

    const memories = await Memory.find(query).sort({ occurredAt: -1 }).limit(100);
    results.memories = await Promise.all(
      memories.map(m => memoryService.serializeMemory(m, currentUser))
    );
  }

  // 2. Search Albums
  if (type === "all" || type === "albums") {
    // ensure public albums are visible to all, and family albums only to connected family members
    const privacyCondition = {
      $or: [
        { privacy: "Public" },
        {
          privacy: "Family",
          ownerFirebaseUid: { $in: [...familyUids, currentUser.uid] }
        },
        { ownerFirebaseUid: currentUser.uid }
      ]
    };

    let query = privacyCondition;
    if (regex) {
      query = {
        $and: [
          privacyCondition,
          {
            $or: [
              { title: regex },
              { subtitle: regex }
            ]
          }
        ]
      };
    }

    const albums = await Album.find(query).sort({ updatedAt: -1 }).limit(50);
    results.albums = await Promise.all(
      albums.map(a => albumService.serializeAlbum(a, currentUser))
    );
  }

  // 3. Search People (Users)
  if (type === "all" || type === "people") {
    const searchConditions = [
      { firebaseUid: { $ne: currentUser.uid } } // Exclude self
    ];

    if (regex) {
      searchConditions.push({
        $or: [
          { displayName: regex },
          { email: regex },
          { profession: regex },
          { bio: regex },
          { location: regex }
        ]
      });
    }

    const query = { $and: searchConditions };
    const users = await User.find(query).limit(50);

    const { getSignedFileUrl } = require("../../services/s3.service");
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
          id: uDoc.firebaseUid,
          name: uDoc.displayName || uDoc.email?.split("@")[0] || "Alexander Mitchell",
          role: uDoc.profession || "Family Contributor",
          location: uDoc.location || "Earth",
          bio: uDoc.bio || "",
          avatar: avatar
        };
      })
    );
  }

  return results;
};

module.exports = {
  searchArchive
};
