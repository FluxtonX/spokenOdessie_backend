/**
 * Utility to parse User-Agent header into readable device info.
 */

function parseUserAgent(uaString = "") {
  const ua = uaString.toLowerCase();

  let deviceType = "desktop";
  if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)) {
    deviceType = "mobile";
  } else if (/ipad|android(?!.*mobile)|tablet/i.test(ua)) {
    deviceType = "tablet";
  }

  let os = "Unknown OS";
  if (ua.includes("win")) os = "Windows";
  else if (ua.includes("mac") && !ua.includes("iphone") && !ua.includes("ipad")) os = "macOS";
  else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) os = "iOS";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("linux")) os = "Linux";

  let browser = "Web Browser";
  if (ua.includes("edg/")) browser = "Edge";
  else if (ua.includes("chrome") && !ua.includes("edg/")) browser = "Chrome";
  else if (ua.includes("safari") && !ua.includes("chrome")) browser = "Safari";
  else if (ua.includes("firefox")) browser = "Firefox";

  const deviceName = `${browser} on ${os}`;

  return {
    deviceName,
    deviceType,
    os,
    browser,
  };
}

module.exports = {
  parseUserAgent,
};
