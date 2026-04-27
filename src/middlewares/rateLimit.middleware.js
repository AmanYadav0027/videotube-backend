import rateLimit from "express-rate-limit";

// General API limiter — applies to all routes
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // 500 requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        statusCode: 429,
        message: "Too many requests, please try again in 15 minutes.",
    },
});

// Strict limiter for auth routes
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // only 10 login/register attempts per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        statusCode: 429,
        message: "Too many auth attempts, please try again in 15 minutes.",
    },
});

// Upload limiter — uploads are expensive
export const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        statusCode: 429,
        message: "Upload limit reached, please try again in an hour.",
    },
});
