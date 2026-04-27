import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import mongoose from "mongoose";
import { Subscription } from "../models/subscription.models.js";
import { Video } from "../models/video.models.js";
import { Like } from "../models/like.models.js";

const getChannelStats = asyncHandler(async (req, res) => {
    //get channelid from req.user?._id
    //wrap these in Promise.all() so they run concurrently
    //count documents in subscription where channel matches the user
    //count docu,ents in video where the owner matches the user
    //aggregate video to sum up the views
    //aggregate like (joining the video) to count total likes
    //return success

    const userId = new mongoose.Types.ObjectId(req.user?._id);

    const totalSubscribersPromise = Subscription.countDocuments({
        channel: userId,
    });

    const totalVideosPromise = Video.countDocuments({
        owner: userId,
    });

    const totalViewsPromise = Video.aggregate([
        {
            $match: {
                owner: userId,
            },
        },
        {
            $group: {
                _id: req.user?._id,
                totalViews: { $sum: "$views" },
            },
        },
    ]);

    // replace the totalLikesPromise with:
    const totalLikesPromise = Like.aggregate([
        {
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "videoData",
            },
        },
        { $unwind: "$videoData" },
        {
            $match: {
                "videoData.owner": userId,
            },
        },
        { $count: "totalLikes" },
    ]);

    const [totalSubscribers, totalVideos, totalViewsArr, totalLikesArr] =
        await Promise.all([
            totalSubscribersPromise,
            totalVideosPromise,
            totalViewsPromise,
            totalLikesPromise,
        ]);

    const stats = {
        totalSubscribers,
        totalVideos,
        totalViews: totalViewsArr[0]?.totalViews || 0,
        totalLikes: totalLikesArr[0]?.totalLikes || 0,
    };

    return res
        .status(200)
        .json(
            new ApiResponse(200, stats, "channel stats fetched successfully")
        );
});

const getChannelVideos = asyncHandler(async (req, res) => {
    //get userId = new mongoose.Types.ObjectId(req.user?._id)
    // get videos from .find method
    //chain .sort to the end of the find query so the creator's newest videos shows up at the top
    //return success

    const userId = new mongoose.Types.ObjectId(req.user?._id);

    const allVideos = await Video.find({
        owner: userId,
    }).sort({ createdAt: -1 });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                allVideos,
                "All videos from the channel fetched successfully"
            )
        );
});

export { getChannelStats, getChannelVideos };
