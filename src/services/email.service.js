/**
 * Email Service for transactional emails (Password Reset, Verification, etc.)
 * Supports standard Resend integration and falls back to console logging in development.
 */

const sendPasswordResetEmail = async (email, resetUrl) => {
  console.log("\n==================================================");
  console.log("📨 PASSWORD RESET EMAIL REQUESTED");
  console.log("Recipient:", email);
  console.log("Reset Link:", resetUrl);
  console.log("==================================================\n");

  const resendApiKey = process.env.RESEND_API_KEY;

  if (resendApiKey) {
    try {
      // Lazy load Resend client
      const { Resend } = require("resend");
      const resend = new Resend(resendApiKey);

      await resend.emails.send({
        from: process.env.EMAIL_FROM || "Spoken Odyssey <noreply@spokenodyssey.com>",
        to: email,
        subject: "Reset Your Spoken Odyssey Password",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
            <h2 style="color: #4A3AFF; text-align: center;">Spoken Odyssey</h2>
            <p>Hello,</p>
            <p>We received a request to reset the password for your account. Click the link below to set a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #4A3AFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Reset Password</a>
            </div>
            <p>This password reset link will expire in 1 hour.</p>
            <p>If you did not request a password reset, please ignore this email or contact support.</p>
            <hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;" />
            <p style="font-size: 12px; color: #888888; text-align: center;">&copy; ${new Date().getFullYear()} Spoken Odyssey. All rights reserved.</p>
          </div>
        `,
      });
      console.log("Email sent successfully via Resend to:", email);
    } catch (err) {
      console.error("Failed to send email via Resend:", err.message);
    }
  } else {
    console.log("Notice: RESEND_API_KEY is not configured in .env.local. Email printed to console instead.");
  }
};

module.exports = {
  sendPasswordResetEmail,
};
