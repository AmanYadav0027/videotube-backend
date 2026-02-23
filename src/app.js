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

//routes declaration
app.use("/api/v2/users", userRouter);

// Add this temporarily
app.post("/api/v2/users/test", (req, res) => {
    res.status(200).json({ message: "Direct POST route is working!" });
});

//http:localhost:8000/api/v2/users/register

export { app };
