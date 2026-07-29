const prisma = require("../../config/prisma");

/**
 * Get or create legacy settings for current user
 */
const getOrCreateLegacySettings = async ({ currentUser }) => {
  let settings = await prisma.legacySettings.findUnique({
    where: { userId: currentUser.id }
  });

  if (!settings) {
    settings = await prisma.legacySettings.create({
      data: {
        userId: currentUser.id,
        administratorName: "Sarah Murphy",
        releaseCondition: "After verified passing",
        familyCircleAccess: "Full archive",
        publicProfile: "Remain public"
      }
    });
  }

  return settings;
};

/**
 * Update legacy settings for current user
 */
const updateLegacySettings = async ({ currentUser, data = {} }) => {
  const existing = await getOrCreateLegacySettings({ currentUser });

  const updateData = {};
  if (data.administrator !== undefined) updateData.administratorName = String(data.administrator);
  if (data.administratorId !== undefined) updateData.administratorId = String(data.administratorId);
  if (data.releaseCondition !== undefined) updateData.releaseCondition = String(data.releaseCondition);
  if (data.familyCircleAccess !== undefined) updateData.familyCircleAccess = String(data.familyCircleAccess);
  if (data.publicProfile !== undefined) updateData.publicProfile = String(data.publicProfile);

  const updated = await prisma.legacySettings.update({
    where: { id: existing.id },
    data: updateData
  });

  return updated;
};

module.exports = {
  getOrCreateLegacySettings,
  updateLegacySettings
};
