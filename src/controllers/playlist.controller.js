import { isValidObjectId } from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Playlist } from "./../models/playlist.models.js";
import { Video } from "./../models/video.models.js";
import mongoose from "mongoose";

const createPlaylist = asyncHandler(async (req, res) => {
    // extract name and desc from body
    //validate
    //create a database entry with name, dec and owner
    //give error if create method fails
    //return success

    const { name, description } = req.body;

    if (!(name && description)) {
        throw new ApiError(400, "Name and Description required");
    }

    const playlist = await Playlist.create({
        name,
        description,
        owner: req.user._id,
    });

    if (!playlist) {
        throw new ApiError(
            500,
            "Something went erong while creating the playlist"
        );
    }

    return res
        .status(201)
        .json(new ApiResponse(201, playlist, "Playlist created Successfully"));
});

const addVideoToPlaylist = asyncHandler(async (req, res) => {
    //extract videoid from params
    //validate with the objectId
    //check if video exist in the database
    // check if the playlist exist in the database
    //validate that the owner is updating the playlist
    //add the video in the playlist(playlistId) using findByIdAndUpdate
    //validate
    //return success

    const { videoId, playlistId } = req.params;

    if (!isValidObjectId(videoId) || !isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid Video or Playlist ID");
    }

    const videoExists = await Video.findById(videoId);
    if (!videoExists) {
        throw new ApiError(404, "Video not found");
    }

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
        throw new ApiError(404, "Playlist not found");
    }

    if (playlist.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(
            403,
            "You do not have permission to modify this playlist"
        );
    }

    const addVideo = await Playlist.findByIdAndUpdate(
        playlistId,
        {
            $addToSet: {
                videos: videoId,
            },
        },
        { new: true }
    );

    if (!addVideo) {
        throw new ApiError(404, "Playlist not found");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                addVideo,
                "Video successfully added to the playlist"
            )
        );
});

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
    //extract videoId and Playlist from params
    //validate
    //check if video exist in the database
    // check if the playlist exist in the database
    //validate that the owner is updating the playlist
    //remove video from playlist using $pull
    //validate
    //return success

    const { videoId, playlistId } = req.params;

    if (!isValidObjectId(videoId) || !isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid Video or Playlist ID");
    }

    const videoExists = await Video.findById(videoId);
    if (!videoExists) {
        throw new ApiError(404, "Video not found in the database");
    }

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
        throw new ApiError(404, "Playlist not found");
    }

    if (playlist.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(
            403,
            "You do not have permission to modify this playlist"
        );
    }

    const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlistId,
        {
            $pull: {
                videos: videoId,
            },
        },
        { new: true }
    );

    return res
        .status(200)
        .json(
            new ApiResponse(200, updatedPlaylist, "Video removed successfully")
        );
});

// Use aggregation instead so every video has full metadata.

// ── Shared pipeline: resolves videos[] with full metadata ────────────────────
const videoLookupPipeline = [
    {
        $lookup: {
            from: "videos",
            localField: "videos",
            foreignField: "_id",
            as: "videos",
            pipeline: [
                { $match: { isPublished: true } },
                {
                    $lookup: {
                        from: "users",
                        localField: "owner",
                        foreignField: "_id",
                        as: "owner",
                        pipeline: [
                            {
                                $project: {
                                    fullName: 1,
                                    username: 1,
                                    avatar: 1,
                                },
                            },
                        ],
                    },
                },
                { $addFields: { owner: { $first: "$owner" } } },
                {
                    $project: {
                        videoFile: 1,
                        thumbnail: 1,
                        title: 1,
                        description: 1,
                        duration: 1,
                        views: 1,
                        createdAt: 1,
                        owner: 1,
                    },
                },
            ],
        },
    },
    // Resolve playlist owner info
    {
        $lookup: {
            from: "users",
            localField: "owner",
            foreignField: "_id",
            as: "ownerInfo",
            pipeline: [{ $project: { fullName: 1, username: 1, avatar: 1 } }],
        },
    },
    { $addFields: { ownerInfo: { $first: "$ownerInfo" } } },
];

const getPlaylistById = asyncHandler(async (req, res) => {
    const { playlistId } = req.params;

    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid PlaylistId");
    }

    const result = await Playlist.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(playlistId) } },
        ...videoLookupPipeline,
    ]);

    if (!result?.length) {
        throw new ApiError(404, "Playlist not found");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, result[0], "Playlist found successfully"));
});

const getUserPlaylists = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid userId");
    }

    const playlists = await Playlist.aggregate([
        { $match: { owner: new mongoose.Types.ObjectId(userId) } },
        ...videoLookupPipeline,
        { $sort: { createdAt: -1 } },
    ]);

    return res
        .status(200)
        .json(
            new ApiResponse(200, playlists, "Playlists fetched successfully")
        );
});

const deletePlaylist = asyncHandler(async (req, res) => {
    //get playlistId and validate
    //find the playlist using findbyid
    //throw erroe if not found
    //check if the owner is the one making changes
    //delete it by using findByIdAndDelete
    //return success

    const { playlistId } = req.params;

    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid playlistId");
    }

    const playlist = await Playlist.findById(playlistId);

    if (!playlist) {
        throw new ApiError(404, "Playlist doesn't exist");
    }

    if (playlist.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(
            403,
            "You do not have permission to modify this playlist"
        );
    }

    await playlist.deleteOne();

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Playlist Deleted successfully"));
});

const updatePlaylist = asyncHandler(async (req, res) => {
    //extract playlistid and validate
    //same with name and description
    //fetch the playlist and verify ownership
    //update the playlist
    //return success

    const { playlistId } = req.params;
    const { name, description } = req.body;

    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid playlistId");
    }

    if (!(name && description)) {
        throw new ApiError(400, "Name and Description Required");
    }

    const playlist = await Playlist.findById(playlistId);

    if (!playlist) {
        throw new ApiError(404, "Playlist doesn't exist");
    }

    if (playlist.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(
            403,
            "You do not have permission to modify this playlist"
        );
    }

    playlist.name = name;
    playlist.description = description;
    const updatedPlaylist = await playlist.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                updatedPlaylist,
                "playlist updated successfully"
            )
        );
});

export {
    createPlaylist,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    getPlaylistById,
    deletePlaylist,
    getUserPlaylists,
    updatePlaylist,
};
