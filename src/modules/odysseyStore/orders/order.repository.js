const prisma = require("../../../config/prisma");

const findByUserId = async ({ userId, page = 1, limit = 10 }) => {
  const skip = (Math.max(1, page) - 1) * limit;

  const [orders, total] = await Promise.all([
    prisma.storeOrder.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                slug: true,
                name: true,
                images: true,
              },
            },
          },
        },
        shipments: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        coupon: {
          select: {
            code: true,
            type: true,
            discountValue: true,
          },
        },
      },
    }),
    prisma.storeOrder.count({ where: { userId } }),
  ]);

  return {
    orders,
    total,
    page: Math.max(1, page),
    totalPages: Math.ceil(total / limit) || 1,
  };
};

const findById = async ({ orderId, userId }) => {
  const order = await prisma.storeOrder.findFirst({
    where: {
      id: orderId,
      ...(userId ? { userId } : {}),
    },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              slug: true,
              name: true,
              images: true,
            },
          },
          variant: true,
        },
      },
      shipments: {
        orderBy: { createdAt: "desc" },
      },
      statusHistory: {
        orderBy: { createdAt: "asc" },
      },
      coupon: {
        select: {
          code: true,
          type: true,
          discountValue: true,
        },
      },
    },
  });

  return order;
};

const findByOrderNumber = async ({ orderNumber, userId }) => {
  return prisma.storeOrder.findFirst({
    where: {
      orderNumber,
      ...(userId ? { userId } : {}),
    },
    include: {
      items: true,
      shipments: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
      coupon: true,
    },
  });
};

const updateStatus = async ({ orderId, status, notes = "", changedBy = "SYSTEM" }) => {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.storeOrder.update({
      where: { id: orderId },
      data: { status },
    });

    await tx.storeOrderStatusHistory.create({
      data: {
        orderId,
        status,
        notes,
        changedBy,
      },
    });

    return updated;
  });
};

const findAllAdmin = async ({ status, page = 1, limit = 20 }) => {
  const skip = (Math.max(1, page) - 1) * limit;

  const where = status ? { status } : {};

  const [orders, total] = await Promise.all([
    prisma.storeOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        items: { take: 1 },
        shipments: { take: 1 },
        user: {
          select: { id: true, displayName: true, email: true, photoURL: true },
        },
      },
    }),
    prisma.storeOrder.count({ where }),
  ]);

  return {
    orders,
    total,
    page: Math.max(1, page),
    totalPages: Math.ceil(total / limit) || 1,
  };
};

module.exports = {
  findByUserId,
  findById,
  findByOrderNumber,
  updateStatus,
  findAllAdmin,
};
