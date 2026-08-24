const prisma = require("../config/prisma");

/**
 * Centralized server-side RBAC middleware for Family Spaces / Circles.
 * Enforces role-based permissions (ADMIN, ADULT_MEMBER, CONTRIBUTOR, RESTRICTED_MINOR, GUEST)
 * and active membership status on backend API routes.
 */
const requireFamilyRole = (allowedRoles = []) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.uid;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required.",
        });
      }

      const familyCircleId =
        req.params.familyCircleId ||
        req.params.id ||
        req.body?.familyCircleId ||
        req.query?.familyCircleId;

      if (!familyCircleId) {
        return res.status(400).json({
          success: false,
          message: "Family circle ID is required for access verification.",
        });
      }

      // Query membership
      const member = await prisma.familyMember.findFirst({
        where: {
          familyCircleId,
          userId,
        },
      });

      if (!member) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You are not a member of this Family Space.",
        });
      }

      if (member.status === "SUSPENDED") {
        return res.status(403).json({
          success: false,
          message: "Access denied. Your Family Space membership is suspended.",
        });
      }

      // ADMIN always has full administrative rights
      if (member.role === "ADMIN") {
        req.familyMember = member;
        return next();
      }

      // Check allowed roles if specified (map legacy MEMBER or null role to ADULT_MEMBER for backwards compatibility)
      const effectiveRole = (member.role === "MEMBER" || !member.role) ? "ADULT_MEMBER" : member.role;
      if (allowedRoles.length > 0 && !allowedRoles.includes(member.role) && !allowedRoles.includes(effectiveRole)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Requires one of the following roles: ${allowedRoles.join(", ")}`,
        });
      }

      req.familyMember = member;
      next();
    } catch (error) {
      console.error("Family RBAC error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to verify family access permissions.",
      });
    }
  };
};

/**
 * Ensures user is either the original owner of a memory OR has active membership
 * in a Family Space where the memory has been linked.
 */
const requireMemoryAccess = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.uid;
    const memoryId = req.params.memoryId || req.params.id;

    if (!userId || !memoryId) {
      return res.status(400).json({
        success: false,
        message: "User ID and Memory ID are required.",
      });
    }

    const memory = await prisma.memory.findUnique({
      where: { id: memoryId },
      include: {
        familyLinks: true,
      },
    });

    if (!memory) {
      return res.status(404).json({
        success: false,
        message: "Memory not found.",
      });
    }

    // Original owner always has access
    if (memory.ownerId === userId) {
      req.memory = memory;
      return next();
    }

    // Public privacy level is accessible
    if (memory.privacy === "Public") {
      req.memory = memory;
      return next();
    }

    // Check if user is tagged
    if (memory.taggedUserIds?.includes(userId)) {
      req.memory = memory;
      return next();
    }

    // Check if memory is linked to any Family Circle where user is an active member
    if (memory.familyLinks && memory.familyLinks.length > 0) {
      const circleIds = memory.familyLinks.map((link) => link.familyCircleId);
      const activeMembership = await prisma.familyMember.findFirst({
        where: {
          familyCircleId: { in: circleIds },
          userId,
          status: "ACTIVE",
        },
      });

      if (activeMembership) {
        req.memory = memory;
        return next();
      }
    }

    return res.status(403).json({
      success: false,
      message: "Access denied to this memory.",
    });
  } catch (error) {
    console.error("Memory access check error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify memory access permissions.",
    });
  }
};

module.exports = {
  requireFamilyRole,
  requireMemoryAccess,
};
