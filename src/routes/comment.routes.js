import { Router } from "express";
import {
    verifyJWT,
    optionalVerifyJWT,
} from "../middlewares/auth.middleware.js";
import {
    addComment,
    updateComment,
    deleteComment,
    getVideoComments,
    addTweetComment,
    getTweetComments,
} from "../controllers/comment.controller.js";

const router = Router();

router
    .route("/c/:commentId")
    .patch(verifyJWT, updateComment)
    .delete(verifyJWT, deleteComment);

router
    .route("/t/:tweetId")
    .post(verifyJWT, addTweetComment)
    .get(optionalVerifyJWT, getTweetComments);

router
    .route("/:videoId")
    .post(verifyJWT, addComment)
    .get(optionalVerifyJWT, getVideoComments);

export default router;
