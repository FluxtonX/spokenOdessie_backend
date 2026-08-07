/**
 * Centralized Email Service using Brevo SMTP (Nodemailer)
 * Handles Forgot Password, Registration OTP Verification, Family Invitations, and System Notifications.
 */

const nodemailer = require("nodemailer");

/**
 * Creates and returns a Nodemailer transporter configured for Brevo SMTP.
 */
const getTransporter = () => {
  const host = process.env.SMTP_HOST || "smtp-relay.brevo.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.warn("⚠️ Brevo SMTP credentials not configured in process.env");
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for 587
    auth: {
      user,
      pass,
    },
  });
};

const getFromHeader = () => process.env.EMAIL_FROM || "Spoken Odyssey <no-reply@spokenodyssey.com>";

/**
 * Send Password Reset OTP Code via Brevo SMTP
 */
const sendPasswordResetEmail = async (email, otpCode) => {
  const transporter = getTransporter();
  
  console.log("\n==================================================");
  console.log("📨 BREVO SMTP: PASSWORD RESET OTP REQUESTED");
  console.log("Recipient:", email);
  console.log("OTP Code:", otpCode);
  console.log("==================================================\n");

  const textContent = `Your Spoken Odyssey password reset verification code is ${otpCode}. It is valid for 15 minutes.`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Reset Password OTP - Spoken Odyssey</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f5f9; margin: 0; padding: 40px 20px;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(74, 58, 255, 0.08); border: 1px solid #e0e7ff;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #4A3AFF 0%, #3b2dd1 100%); padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Spoken Odyssey</h1>
          <p style="color: #e0e7ff; margin: 6px 0 0 0; font-size: 13px; font-weight: 600;">Preserving Life Stories & Memories</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px 28px;">
          <h2 style="color: #1e1b4b; font-size: 20px; font-weight: 700; margin-top: 0;">Password Reset Verification Code</h2>
          <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
            We received a request to reset your password for your <strong>Spoken Odyssey</strong> account. Use the 6-digit OTP code below to complete your reset inside Spoken Odyssey:
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <div style="display: inline-block; background-color: #eef2ff; border: 2px dashed #4A3AFF; padding: 18px 40px; border-radius: 16px;">
              <span style="font-size: 36px; font-weight: 900; letter-spacing: 10px; color: #4A3AFF; font-family: monospace;">${otpCode}</span>
            </div>
          </div>

          <p style="color: #6b7280; font-size: 13px; line-height: 1.5; background-color: #f8fafc; padding: 12px 16px; border-radius: 10px; border-left: 4px solid #4A3AFF; text-align: center;">
            ⏱️ This verification code is active for <strong>15 minutes</strong>. Do not share this code with anyone.
          </p>

          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 28px 0;" />
          
          <p style="color: #9ca3af; font-size: 12px; line-height: 1.4; text-align: center;">
            If you did not request a password reset, please ignore this email. Your account remains completely secure.
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">
            &copy; ${new Date().getFullYear()} Spoken Odyssey. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  if (!transporter) {
    console.error("❌ Brevo SMTP failed: SMTP_USER or SMTP_PASS environment variables are missing from process.env.");
    throw new Error("Email service misconfigured: Brevo SMTP credentials (SMTP_USER/SMTP_PASS) missing on server.");
  }

  try {
    const info = await transporter.sendMail({
      from: getFromHeader(),
      to: email,
      subject: `Spoken Odyssey Password Reset Code: ${otpCode}`,
      text: textContent,
      html: htmlContent,
      headers: {
        "X-Priority": "1 (Highest)",
        "X-MSMail-Priority": "High",
        "Importance": "High",
      },
    });
    console.log("✅ Brevo Password Reset OTP Email delivered to:", email, "| MessageID:", info.messageId);
    return info;
  } catch (err) {
    console.error("❌ Failed to send Password Reset Email via Brevo SMTP:", err.message);
    throw err;
  }
};

/**
 * Send Registration / Email Verification OTP via Brevo SMTP
 */
const sendVerificationEmail = async (email, verificationCode) => {
  const transporter = getTransporter();

  console.log("\n==================================================");
  console.log("📨 BREVO SMTP: REGISTRATION VERIFICATION EMAIL");
  console.log("Recipient:", email);
  console.log("Verification Code:", verificationCode);
  console.log("==================================================\n");

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Verify Your Email - Spoken Odyssey</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f5f9; margin: 0; padding: 40px 20px;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(74, 58, 255, 0.08); border: 1px solid #e0e7ff;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #4A3AFF 0%, #3b2dd1 100%); padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Spoken Odyssey</h1>
          <p style="color: #e0e7ff; margin: 6px 0 0 0; font-size: 13px; font-weight: 600;">Welcome to your digital legacy</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px 28px;">
          <h2 style="color: #1e1b4b; font-size: 20px; font-weight: 700; margin-top: 0;">Verify Your Email Address</h2>
          <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
            Thank you for creating an account on <strong>Spoken Odyssey</strong>. Enter the 6-digit verification code below to activate your account:
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <div style="display: inline-block; background-color: #eef2ff; border: 2px dashed #4A3AFF; padding: 16px 36px; border-radius: 16px;">
              <span style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #4A3AFF;">${verificationCode}</span>
            </div>
          </div>

          <p style="color: #6b7280; font-size: 13px; text-align: center;">
            ⏱️ This verification code will expire in <strong>15 minutes</strong>.
          </p>

          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 28px 0;" />
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            If you did not request this email, please ignore it or contact support.
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">
            &copy; ${new Date().getFullYear()} Spoken Odyssey. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  if (!transporter) {
    console.error("❌ Brevo SMTP failed: SMTP_USER or SMTP_PASS environment variables are missing from process.env.");
    throw new Error("Email service misconfigured: Brevo SMTP credentials (SMTP_USER/SMTP_PASS) missing on server.");
  }

  try {
    const info = await transporter.sendMail({
      from: getFromHeader(),
      to: email,
      subject: `${verificationCode} is your Spoken Odyssey verification code`,
      html: htmlContent,
    });
    console.log("✅ Brevo Verification Email delivered to:", email, "| MessageID:", info.messageId);
    return info;
  } catch (err) {
    console.error("❌ Failed to send Verification Email via Brevo SMTP:", err.message);
    throw err;
  }
};

/**
 * Send Family Circle Invitation Email via Brevo SMTP
 */
const sendFamilyInvitationEmail = async ({ toEmail, senderName, relationship, inviteUrl }) => {
  const transporter = getTransporter();

  console.log("\n==================================================");
  console.log("📨 BREVO SMTP: FAMILY INVITATION EMAIL");
  console.log("Recipient:", toEmail);
  console.log("Sender:", senderName);
  console.log("Relationship:", relationship);
  console.log("Invite Link:", inviteUrl);
  console.log("==================================================\n");

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Join Family Circle on Spoken Odyssey</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f5f9; margin: 0; padding: 40px 20px;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(74, 58, 255, 0.08); border: 1px solid #e0e7ff;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #4A3AFF 0%, #3b2dd1 100%); padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Spoken Odyssey</h1>
          <p style="color: #e0e7ff; margin: 6px 0 0 0; font-size: 13px; font-weight: 600;">Family Circle Invitation</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px 28px;">
          <h2 style="color: #1e1b4b; font-size: 20px; font-weight: 700; margin-top: 0;">You're Invited to Join a Family Circle!</h2>
          <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
            <strong>${senderName}</strong> has invited you to connect on <strong>Spoken Odyssey</strong> as their <strong>${relationship}</strong>.
          </p>
          <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
            Join their Family Circle to listen to voice stories, share memories, and preserve your family legacy together.
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${inviteUrl}" style="background-color: #4A3AFF; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(74, 58, 255, 0.3);">
              Join Family Circle
            </a>
          </div>

          <p style="color: #6b7280; font-size: 13px; line-height: 1.5; background-color: #f8fafc; padding: 12px 16px; border-radius: 10px; border-left: 4px solid #4A3AFF;">
            📅 This invitation link is active for <strong>7 days</strong>.
          </p>

          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 28px 0;" />
          
          <p style="color: #9ca3af; font-size: 12px; line-height: 1.4; word-break: break-all;">
            Or copy and paste this link into your browser:<br />
            <a href="${inviteUrl}" style="color: #4A3AFF; text-decoration: underline;">${inviteUrl}</a>
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">
            &copy; ${new Date().getFullYear()} Spoken Odyssey. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: getFromHeader(),
        to: toEmail,
        subject: `${senderName} invited you to join their Family Circle on Spoken Odyssey`,
        html: htmlContent,
      });
      console.log("✅ Brevo Family Invitation Email delivered to:", toEmail, "| MessageID:", info.messageId);
      return info;
    } catch (err) {
      console.error("❌ Failed to send Family Invitation Email via Brevo SMTP:", err.message);
      throw err;
    }
  }
};

/**
 * Send General Notification Email via Brevo SMTP
 */
const sendNotificationEmail = async ({ toEmail, subject, title, message, actionUrl }) => {
  const transporter = getTransporter();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f5f9; margin: 0; padding: 40px 20px;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(74, 58, 255, 0.08); border: 1px solid #e0e7ff;">
        <div style="background: linear-gradient(135deg, #4A3AFF 0%, #3b2dd1 100%); padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Spoken Odyssey</h1>
        </div>
        <div style="padding: 32px 28px;">
          <h2 style="color: #1e1b4b; font-size: 20px; font-weight: 700; margin-top: 0;">${title}</h2>
          <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">${message}</p>
          ${actionUrl ? `
            <div style="text-align: center; margin: 32px 0;">
              <a href="${actionUrl}" style="background-color: #4A3AFF; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block;">
                View Details
              </a>
            </div>
          ` : ""}
        </div>
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">&copy; ${new Date().getFullYear()} Spoken Odyssey. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: getFromHeader(),
        to: toEmail,
        subject,
        html: htmlContent,
      });
      return info;
    } catch (err) {
      console.error("❌ Failed to send Notification Email via Brevo SMTP:", err.message);
    }
  }
};

/**
 * Send New Device Login Alert Email via Brevo SMTP
 */
const sendNewLoginNotificationEmail = async (email, { deviceName, ipAddress, time }) => {
  const transporter = getTransporter();

  console.log("\n==================================================");
  console.log("📨 BREVO SMTP: NEW DEVICE SIGN-IN ALERT");
  console.log("Recipient:", email);
  console.log("Device:", deviceName);
  console.log("IP Address:", ipAddress);
  console.log("Time:", time);
  console.log("==================================================\n");

  const subject = "Security Alert: New sign-in to your Spoken Odyssey account";
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Sign-In Alert - Spoken Odyssey</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f5f9; margin: 0; padding: 40px 20px;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(74, 58, 255, 0.08); border: 1px solid #e0e7ff;">
        
        <div style="background: linear-gradient(135deg, #4A3AFF 0%, #3b2dd1 100%); padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800;">Spoken Odyssey</h1>
        </div>

        <div style="padding: 32px 28px;">
          <div style="background-color: #eef2ff; border-radius: 12px; padding: 16px; border-left: 4px solid #4A3AFF; margin-bottom: 24px;">
            <h2 style="color: #1e1b4b; font-size: 18px; font-weight: 700; margin: 0 0 6px 0;">New Sign-In Detected</h2>
            <p style="color: #4338ca; font-size: 14px; margin: 0;">We noticed a new device signed into your Spoken Odyssey account.</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr>
              <td style="padding: 10px 0; color: #6b7280; font-size: 14px; font-weight: 600;">Device / Browser:</td>
              <td style="padding: 10px 0; color: #111827; font-size: 14px; font-weight: 700; text-align: right;">${deviceName}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #6b7280; font-size: 14px; font-weight: 600;">IP Address:</td>
              <td style="padding: 10px 0; color: #111827; font-size: 14px; font-weight: 700; text-align: right;">${ipAddress || "Unknown"}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #6b7280; font-size: 14px; font-weight: 600;">Time:</td>
              <td style="padding: 10px 0; color: #111827; font-size: 14px; font-weight: 700; text-align: right;">${time}</td>
            </tr>
          </table>

          <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
            If this was you, you can safely ignore this email. If you did not sign in from this device, please change your password immediately and revoke active sessions in your Security Settings.
          </p>
        </div>

        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">&copy; ${new Date().getFullYear()} Spoken Odyssey Security. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: getFromHeader(),
        to: email,
        subject,
        html: htmlContent,
      });
      return info;
    } catch (err) {
      console.error("❌ Failed to send New Login Notification Email via Brevo SMTP:", err.message);
    }
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendFamilyInvitationEmail,
  sendNotificationEmail,
  sendNewLoginNotificationEmail,
};
