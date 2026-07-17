const prisma = require("./prisma");

const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log("PostgreSQL database connected successfully via Prisma");
  } catch (error) {
    console.error("Database connection failed:", error.message);
    throw error;
  }
};

module.exports = connectDB;
