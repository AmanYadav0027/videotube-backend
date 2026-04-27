import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    getChannelStats,
    getChannelVideos,
} from "../controllers/dashboard.controller.js";
import {
    getFlaggedContent,
    restoreFlaggedContent,
} from "../controllers/moderation.controller.js";

const router = Router();
router.use(verifyJWT);

router.route("/stats").get(getChannelStats);
router.route("/videos").get(getChannelVideos);

router.get("/flagged", getFlaggedContent);
router.post("/flagged/restore/:type/:id", restoreFlaggedContent);

export default router;
