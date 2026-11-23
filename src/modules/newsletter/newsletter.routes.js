const express = require("express");
const prisma = require("../../config/prisma");

const router = express.Router();

router.post("/subscribe", async (req, res) => {
  const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

  if (!fullName || fullName.length > 150) {
    return res.status(400).json({
      success: false,
      message: "Full name is required and must be 150 characters or fewer.",
    });
  }

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: "Please provide a valid email address." });
  }

  try {
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
    if (existing) {
      return res.status(200).json({ success: true, message: "This email is already subscribed." });
    }

    await prisma.newsletterSubscriber.create({ data: { fullName, email } });
    return res.status(201).json({ success: true, message: "Successfully subscribed to the newsletter." });
  } catch (error) {
    // A concurrent request may create the same unique email after the lookup.
    if (error.code === "P2002") {
      return res.status(200).json({ success: true, message: "This email is already subscribed." });
    }

    console.error("Newsletter subscription error:", error);
    return res.status(500).json({ success: false, message: "Could not subscribe at this time." });
  }
});

module.exports = router;
