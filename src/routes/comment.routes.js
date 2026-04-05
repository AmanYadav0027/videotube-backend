import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    addComment,
    updateComment,
    deleteComment,
    getVideoComments,
    addTweetComment,
} from "../controllers/comment.controller.js";

const router = Router();
router.use(verifyJWT);

router.route("/:videoId").post(addComment).get(getVideoComments);
router.route("/c/:commentId").patch(updateComment).delete(deleteComment);
router.route("/t/:tweetId").post(addTweetComment);

export default router;
