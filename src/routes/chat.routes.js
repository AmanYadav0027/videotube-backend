import { Router } from "express";
import { handleChatMessage } from "../controllers/chat.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Protected — only logged-in users can chat
router.post("/:videoId", verifyJWT, handleChatMessage);

export default router;
