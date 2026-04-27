import { Router } from "express";
import {
    verifyJWT,
    optionalVerifyJWT,
} from "../middlewares/auth.middleware.js";
import {
    createTweet,
    deleteTweet,
    getUserTweets,
    updateTweet,
    toggleRetweet,
    getTweetFeed,
} from "../controllers/tweet.controller.js";

const router = Router();

router.get("/feed", optionalVerifyJWT, getTweetFeed);
router.get("/user/:userId", optionalVerifyJWT, getUserTweets);

router.post("/", verifyJWT, createTweet);
router.post("/toggle-retweet/:tweetId", verifyJWT, toggleRetweet);
router.patch("/:tweetId", verifyJWT, updateTweet);
router.delete("/:tweetId", verifyJWT, deleteTweet);

export default router;
