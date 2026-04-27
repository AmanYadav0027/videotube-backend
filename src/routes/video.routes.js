import { Router } from "express";
import {
    getAllVideos,
    getVideoById,
    publishAVideo,
    updateVideo,
    togglePublishStatus,
    deleteVideo,
    incrementVideoViews,
} from "../controllers/video.controller.js";
import {
    verifyJWT,
    optionalVerifyJWT,
} from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import { uploadLimiter } from "../middlewares/rateLimit.middleware.js";

const router = Router();

router.route("/").get(optionalVerifyJWT, getAllVideos);
router.route("/:videoId").get(optionalVerifyJWT, getVideoById);
router.post("/:videoId/view", optionalVerifyJWT, incrementVideoViews);

router.use(verifyJWT);

router.route("/").post(
    uploadLimiter,
    upload.fields([
        { name: "videoFile", maxCount: 1 },
        { name: "thumbnail", maxCount: 1 },
    ]),
    publishAVideo
);

router
    .route("/:videoId")
    .delete(deleteVideo)
    .patch(upload.single("thumbnail"), updateVideo);

router.route("/toggle/publish/:videoId").patch(togglePublishStatus);

export default router;
