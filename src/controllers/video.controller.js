import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    deleteFromCloudinary,
    uploadOnCloudinary,
} from "../utils/cloudinary.js";
import { Video } from "../models/video.models.js";
import { User } from "../models/user.models.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import mongoose, { isValidObjectId } from "mongoose";
import fs from "fs";
import { generateFileHash } from "../utils/fileHash.js";
import { triggerTranscription } from "../utils/aiHelper.js";
import { TranscriptChunk } from "../models/transcriptChunk.models.js";
import { Subscription } from "../models/subscription.models.js";
import { notifyUpload } from "../utils/notificationHelper.js";

const publishAVideo = asyncHandler(async (req, res) => {
    // grab title and description from req.body
    // check if they exist
    //get local file path from req.files for both video and thumbnail
    //throw error if any one of the file is missing
    //upload on cloudinary
    //save to database
    //fan-out upload notification to all subscribers
    //return success

    const { title, description } = req.body;

    if ([title, description].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "VideoFile and Thumbnail are required");
    }

    const videoFileLocalPath = req.files?.videoFile?.[0]?.path;

    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;

    if (!(videoFileLocalPath && thumbnailLocalPath)) {
        throw new ApiError(400, "VideoFile and Thumbnail are required");
    }

    // FILE HASHING
    const fileFingerPrint = await generateFileHash(videoFileLocalPath);

    const existingVideoFile = await Video.findOne({
        fileHash: fileFingerPrint,
    });

    if (existingVideoFile) {
        fs.unlinkSync(videoFileLocalPath);
        fs.unlinkSync(thumbnailLocalPath);

        throw new ApiError(
            409,
            "This Exact video file has already been uploaded to the server."
        );
    }

    const videoFile = await uploadOnCloudinary(videoFileLocalPath);

    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);

    if (!(videoFile && thumbnail)) {
        throw new ApiError(400, "videoFile and Thumbnail is required");
    }

    const video = await Video.create({
        videoFile: videoFile.url,
        thumbnail: thumbnail.url,
        title,
        description,
        duration: videoFile.duration,
        owner: req.user._id,
        fileHash: fileFingerPrint,
    });

    if (!video) {
        throw new ApiError(
            500,
            "Something went wrong while publishing the video"
        );
    }

    triggerTranscription(video.videoFile, video._id);

    Subscription.find({ channel: req.user._id })
        .select("subscriber")
        .lean()
        .then((subs) => {
            notifyUpload(
                subs.map((s) => s.subscriber),
                req.user._id,
                video._id
            );
        });

    return res
        .status(201)
        .json(
            new ApiResponse(
                200,
                video,
                "video published successfully. AI processing started."
            )
        );
});

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    const video = await Video.aggregate([
        // Stage 1 — match video
        {
            $match: { _id: new mongoose.Types.ObjectId(videoId) },
        },
        // Stage 2 — join owner from users
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
            },
        },
        // Stage 3 — flatten owner
        { $unwind: "$owner" },
        // Stage 4 — count total likes
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likes",
            },
        },
        // Stage 5 — check if THIS user liked it ( isLiked persistence)
        {
            $lookup: {
                from: "likes",
                let: { videoId: "$_id" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$video", "$$videoId"] },
                                    // req.user may be null for guests — use $toObjectId safely
                                    {
                                        $eq: [
                                            "$likedBy",
                                            req.user?._id
                                                ? new mongoose.Types.ObjectId(
                                                      req.user._id
                                                  )
                                                : null,
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                ],
                as: "userLike",
            },
        },
        // Stage 6 — count subscribers for the owner
        {
            $lookup: {
                from: "subscriptions",
                localField: "owner._id",
                foreignField: "channel",
                as: "ownerSubscribers",
            },
        },
        // Stage 7 — project
        {
            $project: {
                videoFile: 1,
                thumbnail: 1,
                title: 1,
                description: 1,
                duration: 1,
                views: 1,
                createdAt: 1,
                isPublished: 1,
                aiStatus: 1,
                aiSummary: 1,
                aiChapters: 1,
                likesCount: { $size: "$likes" },
                subscribersCount: { $size: "$ownerSubscribers" },
                //  true when the current user has liked this video
                isLiked: { $gt: [{ $size: "$userLike" }, 0] },
                "owner._id": 1,
                "owner.username": 1,
                "owner.fullName": 1,
                "owner.avatar": 1,
            },
        },
    ]);

    if (!video?.length) {
        throw new ApiError(404, "Video not found");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, video[0], "Video found successfully"));
});

const updateVideo = asyncHandler(async (req, res) => {
    //extract the videoId from req.params and title and description from req.body
    //validate all three
    //check if user uploaded a thumbnail
    //if yes upload it on cloudinary
    //delet the old thumbnail by fetching existing details of video from database
    //update the database
    //return success

    const { videoId } = req.params;
    const { title, description } = req.body;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    if (!(title && description)) {
        throw new ApiError(400, "title or description is missing");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "video not found");
    }

    // #5 — Ownership check: only the video owner can update it
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to update this video");
    }

    const updateData = {
        title,
        description,
    };

    const thumbnailLocalPath = req.file?.path;

    if (thumbnailLocalPath) {
        const thumbnailupload = await uploadOnCloudinary(thumbnailLocalPath);

        if (!thumbnailupload.url) {
            throw new ApiError(400, "Error while uploading thumbnail");
        }

        updateData.thumbnail = thumbnailupload.url;

        if (video.thumbnail) {
            await deleteFromCloudinary(video.thumbnail);
        }
    }

    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: updateData,
        },
        { new: true }
    );

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                updatedVideo,
                "video detail updated successfully"
            )
        );
});

const deleteVideo = asyncHandler(async (req, res) => {
    //get videoId from params
    //validate
    //fetch the video using videoId
    //check if the video is returned or not
    //delete the video by calling deleteFromCloudinary utility
    //delete from database
    //return success

    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(
            404,
            "the video doesn't exist or was already deleted"
        );
    }

    // #5 — Ownership check: only the video owner can delete it
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to delete this video");
    }

    await deleteFromCloudinary(video.thumbnail);
    await deleteFromCloudinary(video.videoFile, "video");

    await Video.findByIdAndDelete(videoId);
    await TranscriptChunk.deleteMany({ videoId });

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "video deleted successfully"));
});

const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

    const matchCondition = {
        isPublished: true,
    };

    if (query) {
        matchCondition.$or = [
            { title: { $regex: query, $options: "i" } },
            { description: { $regex: query, $options: "i" } },
        ];
    }

    if (userId) {
        matchCondition.owner = new mongoose.Types.ObjectId(userId);
    }

    const sortOptions = {};
    if (sortBy && sortType) {
        sortOptions[sortBy] = sortType === "asc" ? 1 : -1;
    } else {
        sortOptions.createdAt = -1;
    }

    const videoAggregate = Video.aggregate([
        // Stage 1: filter by match conditions (isPublished, query, userId)
        {
            $match: matchCondition,
        },
        // Stage 2: join owner
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
            },
        },
        // Stage 3: flatten owner array
        {
            $unwind: "$owner",
        },
        //  $sort BEFORE $project — sortBy fields (views, createdAt) must
        // still exist on the document when $sort runs. $project used to come
        // before $sort, which stripped createdAt/views, making all sorts identical.
        {
            $sort: sortOptions,
        },
        // Stage 4: project only what frontend needs
        {
            $project: {
                videoFile: 1,
                thumbnail: 1,
                title: 1,
                description: 1,
                duration: 1,
                views: 1,
                isPublished: 1,
                createdAt: 1,
                "owner._id": 1,
                "owner.username": 1,
                "owner.avatar": 1,
            },
        },
    ]);

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
    };

    const videos = await Video.aggregatePaginate(videoAggregate, options);

    return res
        .status(200)
        .json(new ApiResponse(200, videos, "Videos fetched successfully"));
});

const togglePublishStatus = asyncHandler(async (req, res) => {
    //get videoId from params
    //fetch the vide using id
    //use not operator(!) to flip
    //save changes in db
    //return success

    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid Object Id");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video is not available");
    }

    // #5 — Ownership check: only the video owner can toggle publish status
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(
            403,
            "You are not authorized to change the publish status of this video"
        );
    }

    video.isPublished = !video.isPublished;

    await video.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(new ApiResponse(200, video, "status was toggled successfully"));
});

const recentViews = new Set(); // module-level, lives for server lifetime

const incrementVideoViews = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const clientKey = `${req.ip}_${videoId}`;

    if (recentViews.has(clientKey)) {
        return res
            .status(200)
            .json({ success: true, message: "View already counted." });
    }

    recentViews.add(clientKey);
    setTimeout(() => recentViews.delete(clientKey), 30 * 60 * 1000);

    await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });

    // Move watch history here — runs once, deduplicated
    if (req.user?._id) {
        await User.findByIdAndUpdate(req.user._id, {
            $addToSet: { watchHistory: videoId },
        });
    }

    return res.status(200).json({ success: true });
});

export {
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    getAllVideos,
    togglePublishStatus,
    incrementVideoViews,
};
