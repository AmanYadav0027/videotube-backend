import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { Tweet } from "../models/tweet.model";
import { isValidObjectId } from "mongoose";
import { ApiResponse } from "../utils/ApiResponse";

const createTweet = asyncHandler(async (req, res) => {
    // extract content from req.body
    // validate it to check they are not empty
    //create a database entry using create
    // give error if create method fails
    // return success

    const { content } = req.body;

    if (!content) {
        throw new ApiError(400, "Content is required");
    }

    const tweet = await Tweet.create({
        content,
        owner: req.user?._id,
    });

    if (!tweet) {
        throw new ApiError(500, "Failed to create a tweet");
    }

    return res
        .status(201)
        .json(new ApiResponse(201, tweet, "Tweet created successfully"));
});

const getUserTweets = asyncHandler(async (req, res) => {
    //get userId from params and validate
    //find all tweets using userId in find method
    //populate tweets to display owners fullname and avatar
    //check the length of tweets if its empty throw error tweets not found
    //return success

    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid UserId");
    }

    const allTweets = await Tweet.find({
        owner: userId,
    }).populate("owner", "fullName avatar");

    if (!allTweets.length) {
        throw new ApiError(404, "Tweets not found");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, allTweets, "All tweets fetched Successfully")
        );
});

const updateTweet = asyncHandler(async (req, res) => {
    //get tweetId from params and validate
    //get content from body and validate
    //fetch tweet using findById
    //check if the owner is the one updating the tweet
    // update content
    //if failed to update throw error
    //return success

    const { tweetId } = req.params;
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweetId");
    }

    const { content } = req.body;
    if (!content) {
        throw new ApiError(400, "Content not found");
    }

    const tweet = await Tweet.findById(tweetId);

    if (!tweetId) {
        throw new ApiError(404, "Tweet Id not found");
    }

    if (tweet.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(
            403,
            "You do not have permission to modify this tweet"
        );
    }

    tweet.content = content;
    const updatedTweet = await tweet.save();

    return res
        .status(200)
        .json(new ApiResponse(200, updatedTweet, "Tweet updated successfully"));
});

const deleteTweet = asyncHandler(async (req, res) => {
    //get tweetId from params and validate
    //find the tweet using findbyid
    //check if the tweet exist
    //check if the owner is the one deleting
    //delete the tweet using deleteOne
    //return success

    const { tweetId } = req.params;
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid TweetId");
    }

    const tweet = await Tweet.findById(tweetId);
    if (!tweet) {
        throw new ApiError(404, "Tweet not found");
    }

    if (tweet.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(
            403,
            "You do not have permission to delete this tweet"
        );
    }

    await tweet.deleteOne();

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Tweet deleted successfully"));
});

export { createTweet, getUserTweets, updateTweet, deleteTweet };
