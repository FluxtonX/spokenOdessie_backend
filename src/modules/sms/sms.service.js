const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

// Initialize SNS Client
const snsClient = new SNSClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Send SMS invitation via AWS SNS
 * @param {Object} params - SMS parameters
 * @param {string} params.phoneNumber - Phone number with country code (e.g., "+15550000000")
 * @param {string} params.message - SMS message content
 * @param {string} params.senderId - Optional sender ID (default: "SpokenOdy")
 * @returns {Promise<Object>} Result from AWS SNS
 */
async function sendSMS({ phoneNumber, message, senderId = "SpokenOdy" }) {
  try {
    // Validate phone number format
    if (!phoneNumber || !phoneNumber.startsWith("+")) {
      throw new Error("Invalid phone number format. Must include country code (e.g., +15550000000)");
    }

    // Validate message length (SMS limit is typically 160 characters for single segment)
    if (message.length > 160) {
      console.warn("SMS message exceeds 160 characters. May be sent as multiple segments.");
    }

    const params = {
      PhoneNumber: phoneNumber,
      Message: message,
      MessageAttributes: {
        "AWS.SNS.SMS.SenderID": {
          DataType: "String",
          StringValue: senderId,
        },
        "AWS.SNS.SMS.SMSType": {
          DataType: "String",
          StringValue: "Transactional", // Use Transactional for higher deliverability
        },
      },
    };

    const command = new PublishCommand(params);
    const response = await snsClient.send(command);

    console.log("SMS sent successfully:", {
      messageId: response.MessageId,
      phoneNumber: phoneNumber,
    });

    return {
      success: true,
      messageId: response.MessageId,
      phoneNumber: phoneNumber,
    };
  } catch (error) {
    console.error("Error sending SMS via AWS SNS:", error);
    
    // Handle specific AWS SNS errors
    if (error.name === "InvalidParameter") {
      throw new Error("Invalid phone number or message parameters");
    } else if (error.name === "Throttling") {
      throw new Error("SMS sending rate limit exceeded. Please try again later.");
    } else if (error.name === "AccessDenied") {
      throw new Error("AWS credentials do not have permission to send SMS");
    }
    
    throw new Error("Failed to send SMS: " + error.message);
  }
}

/**
 * Send family invitation SMS
 * @param {Object} params - Invitation parameters
 * @param {string} params.phoneNumber - Phone number with country code
 * @param {string} params.inviterName - Name of the person sending the invitation
 * @param {string} params.invitationLink - Link to accept the invitation
 * @param {string} params.relationship - Relationship to the family
 * @returns {Promise<Object>} Result from SMS sending
 */
async function sendInvitationSMS({ phoneNumber, inviterName, invitationLink, relationship }) {
  const message = `You're invited to join ${inviterName}'s family circle on Spoken Odyssey as ${relationship}. Accept: ${invitationLink}`;
  
  return sendSMS({
    phoneNumber,
    message,
  });
}

/**
 * Send verification SMS
 * @param {Object} params - Verification parameters
 * @param {string} params.phoneNumber - Phone number with country code
 * @param {string} params.code - Verification code
 * @returns {Promise<Object>} Result from SMS sending
 */
async function sendVerificationSMS({ phoneNumber, code }) {
  const message = `Your Spoken Odyssey verification code is: ${code}. Valid for 10 minutes.`;
  
  return sendSMS({
    phoneNumber,
    message,
  });
}

/**
 * Validate phone number format
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validatePhoneNumber(phoneNumber) {
  // Remove all non-numeric characters except +
  const cleaned = phoneNumber.replace(/[^\d+]/g, "");
  
  // Check if it starts with + and has at least 10 digits
  return cleaned.startsWith("+") && cleaned.length >= 12;
}

/**
 * Format phone number with country code
 * @param {string} countryCode - Country code (e.g., "+1")
 * @param {string} phoneNumber - Phone number without country code
 * @returns {string} Formatted phone number
 */
function formatPhoneNumber(countryCode, phoneNumber) {
  // Remove all non-numeric characters from phone number
  const cleanedNumber = phoneNumber.replace(/\D/g, "");
  
  // Ensure country code starts with +
  const cleanedCode = countryCode.startsWith("+") ? countryCode : "+" + countryCode;
  
  return cleanedCode + cleanedNumber;
}

module.exports = {
  sendSMS,
  sendInvitationSMS,
  sendVerificationSMS,
  validatePhoneNumber,
  formatPhoneNumber,
};
