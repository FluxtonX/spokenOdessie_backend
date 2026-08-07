/**
 * Rate Limiting Middleware
 * Prevents abuse of API endpoints by limiting request frequency
 */

const rateLimitMap = new Map();

/**
 * Create a rate limiter
 * @param {Object} options - Rate limiting options
 * @param {number} options.windowMs - Time window in milliseconds (default: 15 minutes)
 * @param {number} options.maxRequests - Maximum requests per window (default: 100)
 * @param {string} options.keyGenerator - Custom key generator function (default: uses IP)
 * @returns {Function} Express middleware function
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    maxRequests = 100,
    keyGenerator = (req) => req.ip || req.connection.remoteAddress
  } = options;

  return (req, res, next) => {
    if (process.env.NODE_ENV === "test") {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();

    // Get or create rate limit data for this key
    let rateLimitData = rateLimitMap.get(key);

    if (!rateLimitData || rateLimitData.resetTime <= now) {
      // Create new rate limit window
      rateLimitData = {
        count: 0,
        resetTime: now + windowMs
      };
      rateLimitMap.set(key, rateLimitData);
    }

    // Check if limit exceeded
    if (rateLimitData.count >= maxRequests) {
      const resetTime = new Date(rateLimitData.resetTime).toISOString();
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', resetTime);
      
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please try again later.",
        retryAfter: Math.ceil((rateLimitData.resetTime - now) / 1000)
      });
    }

    // Increment request count
    rateLimitData.count++;
    rateLimitMap.set(key, rateLimitData);

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - rateLimitData.count);
    res.setHeader('X-RateLimit-Reset', new Date(rateLimitData.resetTime).toISOString());

    next();
  };
}

/**
 * Clean up expired rate limit entries
 * Run this periodically to prevent memory leaks
 */
function cleanupRateLimitMap() {
  const now = Date.now();
  for (const [key, data] of rateLimitMap.entries()) {
    if (data.resetTime <= now) {
      rateLimitMap.delete(key);
    }
  }
}

// Clean up every 5 minutes
setInterval(cleanupRateLimitMap, 5 * 60 * 1000);

/**
 * Pre-configured rate limiters for different use cases
 */
const rateLimiters = {
  // General API rate limiter (100 requests per 15 minutes)
  general: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 100
  }),

  // Strict rate limiter for sensitive operations (10 requests per 15 minutes)
  strict: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 10
  }),

  // Invitation rate limiter (5 invitations per hour per user)
  invitation: createRateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
    keyGenerator: (req) => {
      // Rate limit by user ID if authenticated, otherwise by IP
      return req.user?.id || req.ip || req.connection.remoteAddress;
    }
  }),

  // SMS rate limiter (3 SMS per hour per user)
  sms: createRateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 3,
    keyGenerator: (req) => {
      return req.user?.id || req.ip || req.connection.remoteAddress;
    }
  }),

  // Auth rate limiter (5 login attempts per 15 minutes)
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 5
  })
};

module.exports = {
  createRateLimiter,
  rateLimiters,
  cleanupRateLimitMap
};
