import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

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

//http:localhost:8000/api/v2/users/register

app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;

    return res.status(statusCode).json({
        success: false,
        message: err.message,
        errors: err.errors || [],
    });
});

export { app };
