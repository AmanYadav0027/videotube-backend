import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";

const app = express();

app.use(
    cors({
        origin: process.env.CORS_ORIGIN,
        credentials: true,
    })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

app.use((req, res, next) => {
    Object.defineProperty(req, "query", {
        value: req.query,
        writable: true,
        configurable: true,
        enumerable: true,
    });
    next();
});
// Strip $ and . from keys to prevent NoSQL injection attacks
app.use(mongoSanitize());

//  Remove duplicate query/body params to prevent HTTP parameter pollution
app.use(hpp());

//routes import
import userRouter from "./routes/user.routes.js";
import videoRouter from "./routes/video.routes.js";
import playlistRouter from "./routes/playlist.routes.js";
import subscriptionRouter from "./routes/subscription.routes.js";
import tweetRouter from "./routes/tweet.routes.js";
import likeRouter from "./routes/like.routes.js";
import commentRouter from "./routes/comment.routes.js";
import healthcheckRouter from "./routes/healthcheck.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";
import webhookRouter from "./routes/webhook.routes.js";
import chatRouter from "./routes/chat.routes.js";
import supportRouter from "./routes/support.routes.js";
import notificationRouter from "./routes/notification.routes.js";
import { apiLimiter } from "./middlewares/rateLimit.middleware.js";
import helmet from "helmet";

app.use(helmet());
// Global — apply to all /api routes
app.use("/api", apiLimiter);

//routes declaration
app.use("/api/v2/users", userRouter);
app.use("/api/v2/videos", videoRouter);
app.use("/api/v2/playlists", playlistRouter);
app.use("/api/v2/subscriptions", subscriptionRouter);
app.use("/api/v2/tweets", tweetRouter);
app.use("/api/v2/likes", likeRouter);
app.use("/api/v2/comments", commentRouter);
app.use("/api/v2/healthchecks", healthcheckRouter);
app.use("/api/v2/dashboards", dashboardRouter);
app.use("/api/v2/webhooks", webhookRouter);
app.use("/api/v2/chat", chatRouter);
app.use("/api/v2/support", supportRouter);
app.use("/api/v2/notifications", notificationRouter);

//http:localhost:8000/api/v2/users/register

app.use((err, req, res, next) => {
    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
            success: false,
            message:
                "File too large. Maximum video size is 100MB on the free plan.",
        });
    }
    const statusCode = err.statusCode || 500;

    return res.status(statusCode).json({
        success: false,
        message: err.message,
        errors: err.errors || [],
    });
});

export { app };
