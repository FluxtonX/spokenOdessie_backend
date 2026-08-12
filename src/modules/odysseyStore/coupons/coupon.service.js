const couponRepository = require("./coupon.repository");
const prisma = require("../../../config/prisma");

const validateCoupon = async ({ code, userId, subtotal }) => {
  if (!code) {
    const error = new Error("Coupon code is required");
    error.statusCode = 400;
    throw error;
  }

  const coupon = await couponRepository.findByCode(code);
  if (!coupon || !coupon.isActive) {
    const error = new Error("Invalid or expired coupon code");
    error.statusCode = 400;
    throw error;
  }

  if (coupon.expiresAt && new Date() > new Date(coupon.expiresAt)) {
    const error = new Error("This coupon has expired");
    error.statusCode = 400;
    throw error;
  }

  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    const error = new Error("This coupon has reached its maximum usage limit");
    error.statusCode = 400;
    throw error;
  }

  if (subtotal && subtotal < coupon.minOrderAmount) {
    const error = new Error(`Minimum order amount for this coupon is $${coupon.minOrderAmount.toFixed(2)}`);
    error.statusCode = 400;
    throw error;
  }

  if (userId && coupon.perUserLimit) {
    const userUsageCount = await prisma.storeOrder.count({
      where: {
        userId,
        couponId: coupon.id,
        status: { notIn: ["CANCELLED", "PAYMENT_FAILED"] },
      },
    });

    if (userUsageCount >= coupon.perUserLimit) {
      const error = new Error("You have already reached the usage limit for this coupon");
      error.statusCode = 400;
      throw error;
    }
  }

  let discountAmount = 0;
  if (subtotal) {
    if (coupon.type === "PERCENTAGE") {
      discountAmount = (subtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else {
      discountAmount = Math.min(coupon.discountValue, subtotal);
    }
  }

  return {
    valid: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      discountValue: coupon.discountValue,
      discountAmount,
    },
  };
};

const getCoupons = async () => {
  return couponRepository.findAll();
};

const createCoupon = async (data) => {
  return couponRepository.create(data);
};

const updateCoupon = async (id, data) => {
  return couponRepository.update(id, data);
};

module.exports = {
  validateCoupon,
  getCoupons,
  createCoupon,
  updateCoupon,
};
