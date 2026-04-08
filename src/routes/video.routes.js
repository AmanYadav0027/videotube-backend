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

const router = Router();
router.use(verifyJWT);

router
    .route("/")
    .get(getAllVideos)
    .post(
        upload.fields([
            {
                name: "videoFile",
                maxCount: 1,
            },
            {
                name: "thumbnail",
                maxCount: 1,
            },
        ]),
        publishAVideo
    );

router
    .route("/:videoId")
    .get(getVideoById)
    .delete(deleteVideo)
    .patch(upload.single("thumbnail"), updateVideo);

router.route("/toggle/publish/:videoId").patch(togglePublishStatus);

router.post("/:videoId/view", optionalVerifyJWT, incrementVideoViews);

export default router;
