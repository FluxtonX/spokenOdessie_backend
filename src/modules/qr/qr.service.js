const QRCode = require("qrcode");

/**
 * Generate QR code for invitation link
 * @param {Object} params - QR code parameters
 * @param {string} params.data - Data to encode in QR code (typically invitation link)
 * @param {Object} params.options - QR code generation options
 * @returns {Promise<string>} Base64 encoded QR code image
 */
async function generateQRCode({ data, options = {} }) {
  try {
    if (!data) {
      throw new Error("Data is required to generate QR code");
    }

    // Default QR code options
    const defaultOptions = {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
      errorCorrectionLevel: "M", // Medium error correction
      ...options,
    };

    // Generate QR code as data URL (base64)
    const qrCodeDataURL = await QRCode.toDataURL(data, defaultOptions);

    return {
      success: true,
      qrCode: qrCodeDataURL,
      data: data,
    };
  } catch (error) {
    console.error("Error generating QR code:", error);
    throw new Error("Failed to generate QR code: " + error.message);
  }
}

/**
 * Generate QR code for family invitation
 * @param {Object} params - Invitation parameters
 * @param {string} params.invitationToken - Unique invitation token
 * @param {string} params.frontendUrl - Frontend URL (default from env)
 * @returns {Promise<Object>} QR code data with invitation link
 */
async function generateInvitationQR({ invitationToken, frontendUrl }) {
  const baseUrl = frontendUrl || process.env.FRONTEND_URL || "http://localhost:3000";
  const invitationLink = `${baseUrl}/family/join?token=${invitationToken}`;

  const qrCode = await generateQRCode({
    data: invitationLink,
    options: {
      width: 400,
      margin: 3,
      color: {
        dark: "#4A3AFF", // Use brand color for QR code
        light: "#FFFFFF",
      },
    },
  });

  return {
    ...qrCode,
    invitationLink: invitationLink,
    invitationToken: invitationToken,
  };
}

/**
 * Generate QR code as buffer (for saving to file or sending as image)
 * @param {Object} params - QR code parameters
 * @param {string} params.data - Data to encode
 * @param {Object} params.options - QR code options
 * @returns {Promise<Buffer>} QR code image buffer
 */
async function generateQRCodeBuffer({ data, options = {} }) {
  try {
    if (!data) {
      throw new Error("Data is required to generate QR code");
    }

    const defaultOptions = {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
      errorCorrectionLevel: "M",
      ...options,
    };

    const buffer = await QRCode.toBuffer(data, defaultOptions);

    return {
      success: true,
      buffer: buffer,
      mimeType: "image/png",
    };
  } catch (error) {
    console.error("Error generating QR code buffer:", error);
    throw new Error("Failed to generate QR code buffer: " + error.message);
  }
}

/**
 * Validate QR code data
 * @param {string} data - Data to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateQRData(data) {
  if (!data || typeof data !== "string") {
    return false;
  }

  // Check if data is too long (QR codes have limits)
  if (data.length > 2000) {
    console.warn("QR code data is very long. May affect scannability.");
  }

  return true;
}

/**
 * Generate QR code with custom styling
 * @param {Object} params - Custom QR code parameters
 * @param {string} params.data - Data to encode
 * @param {Object} params.style - Custom style options
 * @returns {Promise<string>} Base64 encoded QR code
 */
async function generateStyledQRCode({ data, style = {} }) {
  const defaultStyle = {
    darkColor: "#4A3AFF",
    lightColor: "#FFFFFF",
    width: 400,
    margin: 3,
    errorCorrectionLevel: "H", // High error correction for custom styling
  };

  const mergedStyle = { ...defaultStyle, ...style };

  return generateQRCode({
    data,
    options: {
      width: mergedStyle.width,
      margin: mergedStyle.margin,
      color: {
        dark: mergedStyle.darkColor,
        light: mergedStyle.lightColor,
      },
      errorCorrectionLevel: mergedStyle.errorCorrectionLevel,
    },
  });
}

module.exports = {
  generateQRCode,
  generateInvitationQR,
  generateQRCodeBuffer,
  validateQRData,
  generateStyledQRCode,
};
