import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import crypto from "crypto";
import { sendVerificationEmail } from "../utils/sendEmail.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshTokens = async (userId) => {
    // 1. Find the user in the database using their ID.
    // 2. Ask the user model to create a short-lived Access Token.
    // 3. Ask the user model to create a long-lived Refresh Token.
    // 4. Save the new Refresh Token into the user's database record (skip other validations).
    // 5. Return both tokens to whoever called this function.

    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(
            500,
            "Something went wrong while generating refresh and access tokens"
        );
    }
};

const registerUser = asyncHandler(async (req, res) => {
    // 1. Receive data (fullName, email, username, password) from the request body.
    // 2. Validate: Are any of these fields empty? If yes, throw an error.
    // 3. Validate: Is the password less than 8 characters? If yes, throw an error.
    // 4. Database: Check if a user with this email or username already exists. Throw error if true.
    // 5. Receive files: Extract the local file paths for the avatar and cover image.
    // 6. Validate: Is the avatar missing? If yes, throw an error.
    // 7. Process: Upload the avatar (and cover image, if provided) to Cloudinary.
    // 8. Database: Create and save the new user with the text data and Cloudinary image URLs.
    // 9. Database: Fetch this newly created user, but remove the password and token from the result.
    // 10. Respond: Send a 201 Success status with the clean user data.

    if (!req.body) {
        throw new ApiError(400, "Request body is missing");
    }

    const { fullName, email, username, password } = req.body;

    if (
        [fullName, email, username, password].some(
            (field) => field?.trim() === ""
        )
    ) {
        throw new ApiError(400, "All fields are required");
    }

    if (password.length < 8) {
        throw new ApiError(400, "Password must be at least 8 character long");
    }

    // #10 — Sanitize username: lowercase, strip all non-alphanumeric/underscore/hyphen chars,
    // collapse multiple spaces, reject if invalid characters remain after sanitization.
    const sanitizedUsername = username
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_-]/g, "");

    if (!sanitizedUsername) {
        throw new ApiError(400, "Username contains only invalid characters");
    }

    if (sanitizedUsername.length < 3) {
        throw new ApiError(400, "Username must be at least 3 characters long");
    }

    if (sanitizedUsername.length > 30) {
        throw new ApiError(400, "Username must not exceed 30 characters");
    }

    const existedUser = await User.findOne({
        $or: [{ username: sanitizedUsername }, { email }],
    });

    if (existedUser) {
        throw new ApiError(409, "User with email or username already exist");
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if (
        req.files &&
        Array.isArray(req.files.coverImage) &&
        req.files.coverImage.length > 0
    ) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required");
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: sanitizedUsername,
        verificationToken,
        isVerified: false,
    });

    await sendVerificationEmail(email, verificationToken);

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if (!createdUser) {
        throw new ApiError(
            500,
            "Something went wrong while registering the user"
        );
    }

    return res
        .status(201)
        .json(
            new ApiResponse(
                200,
                createdUser,
                "User registered Successfully. Please check your email to verify your account."
            )
        );
});

const verifyEmail = asyncHandler(async (req, res) => {
    const { token } = req.query;

    if (!token) throw new ApiError(400, "Verification token is missing");

    const user = await User.findOne({ verificationToken: token });

    if (!user) throw new ApiError(400, "Invalid or expired verification token");

    // Use findByIdAndUpdate to avoid triggering the bcrypt pre-save hook
    await User.findByIdAndUpdate(user._id, {
        $set: { isVerified: true },
        $unset: { verificationToken: "" }, // properly removes the field
    });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {},
                "Email verified successfully. You can now log in."
            )
        );
});

const loginUser = asyncHandler(async (req, res) => {
    // 1. Receive data (email or username, and password) from the request body.
    // 2. Validate: Did they provide at least an email or a username?
    // 3. Database: Search for a user with that exact email or username.
    // 4. Validate: If no user is found, throw a 404 error.
    // 5. Process: Compare the typed password with the encrypted password in the database.
    // 6. Validate: If passwords don't match, throw a 401 Unauthorized error.
    // 7. Process: Call our helper function to generate new Access and Refresh tokens.
    // 8. Database: Fetch the user data again, stripping out the password and refresh token.
    // 9. Process: Put the tokens inside secure, http-only cookies.
    // 10. Respond: Send a 200 Success status with the user data and cookies.

    const { email, username, password } = req.body;

    if (!username && !email) {
        throw new ApiError(400, "username or email is required");
    }

    // Here is an alternative of above code based on logic discussed in video:
    // if (!(username || email)) {
    //     throw new ApiError(400, "username or email is required")

    // }

    const user = await User.findOne({
        $or: [{ username }, { email }],
    });

    if (!user) {
        throw new ApiError(404, "User does not exist");
    }

    if (!user.isVerified) {
        throw new ApiError(403, "Please verify your email before logging in");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
        user._id
    );

    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    const options = {
        httpOnly: true,
        secure: true,
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken,
                    refreshToken,
                },
                "User logged In Successfully"
            )
        );
});

const logoutUser = asyncHandler(async (req, res) => {
    // 1. Database: Find the currently logged-in user (using req.user._id) and delete their Refresh Token from the DB.
    // 2. Process: Clear the 'accessToken' and 'refreshToken' cookies from the user's browser.
    // 3. Respond: Send a 200 Success status confirming they are logged out.

    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined,
            },
        },
        {
            new: true,
        }
    );

    const options = {
        httpOnly: true,
        secure: true,
    };

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged Out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    // 1. Receive: Grab the incoming Refresh Token from the user's cookies (or request body).
    // 2. Validate: If there is no token, throw an error.
    // 3. Process: Decode the token using our secret key to get the user's ID.
    // 4. Database: Find the user using that decoded ID.
    // 5. Validate: Does the incoming token exactly match the token saved in the database? If not, throw error.
    // 6. Process: Generate a brand new pair of Access and Refresh tokens.
    // 7. Process: Put the new tokens into secure cookies.
    // 8. Respond: Send a 200 Success status with the fresh tokens.

    const incomingRefreshToken =
        req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized request");
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        const user = await User.findById(decodedToken?._id);

        if (!user) {
            throw new ApiError(401, "Invalid refresh token");
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used");
        }

        const options = {
            httpOnly: true,
            secure: true,
        };

        const { accessToken, newRefreshToken } =
            await generateAccessAndRefreshTokens(user._id);

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    { accessToken, refreshToken: newRefreshToken },
                    "Access token refreshed"
                )
            );
    } catch (error) {
        throw new ApiError(402, error?.message || "Invalid refresh token");
    }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
    // 1. Receive: Get the old password and the new password from the request body.
    // 2. Database: Find the currently logged-in user.
    // 3. Process: Check if the old password they typed matches their actual current database password.
    // 4. Validate: If it doesn't match, throw an error.
    // 5. Database: Replace their old password with the new one and save the document.
    // 6. Respond: Send a 200 Success status.

    const { oldPassword, newPassword } = req.body;

    const user = await User.findById(req.user?._id);

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Old password is incorrect");
    }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
    // 1. Receive: Get the user details that the Auth Middleware already attached to the request (req.user).
    // 2. Respond: Send a 200 Success status returning that exact user data.

    return res
        .status(200)
        .json(
            new ApiResponse(200, req.user, "current user fetched successfully")
        );
});

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email, username } = req.body;

    if (!fullName || !email) {
        throw new ApiError(400, "Full name and email are required");
    }

    // Build update object — only include username if provided
    const updateFields = { fullName, email };

    if (username) {
        const trimmed = username.trim().toLowerCase();

        // Check uniqueness (exclude current user)
        const taken = await User.findOne({
            username: trimmed,
            _id: { $ne: req.user._id },
        });
        if (taken) {
            throw new ApiError(409, "Username is already taken");
        }

        updateFields.username = trimmed;
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updateFields },
        { new: true }
    ).select("-password -refreshToken");

    return res
        .status(200)
        .json(
            new ApiResponse(200, user, "Account details updated successfully")
        );
});

const updateUserAvatar = asyncHandler(async (req, res) => {
    // 1. Receive: Extract the local file path of the new avatar from the request.
    // 2. Validate: Is the file missing? If so, throw an error.
    // 3. Process: Upload the new file to Cloudinary.
    // 4. Validate: Did the upload fail? If so, throw an error.
    // 5. Database: Find the user by ID, update their avatar URL with the new Cloudinary URL, and return the clean updated document.
    // 6. Respond: Send a 200 Success status.

    const avatarLocalPath = req.file?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    // #18 — Guard against null return from uploadOnCloudinary before accessing .url
    // Previously `if (!avatar.url)` would throw a TypeError crash when avatar is null
    if (!avatar || !avatar.url) {
        throw new ApiError(400, "Error while uploading the avatar");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url,
            },
        },
        { new: true }
    ).select("-password");

    return res
        .status(200)
        .json(new ApiResponse(200, user, " Avatar updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
    // 1. Receive: Extract the local file path of the new cover image from the request.
    // 2. Validate: Is the file missing? If so, throw an error.
    // 3. Process: Upload the new file to Cloudinary.
    // 4. Validate: Did the upload fail? If so, throw an error.
    // 5. Database: Find the user by ID, update their cover image URL with the new Cloudinary URL, and return the clean updated document.
    // 6. Respond: Send a 200 Success status.

    const coverImageLocalPath = req.file?.path;

    if (!coverImageLocalPath) {
        throw new ApiError(400, "Cover image file is missing");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    // #18 — Guard against null return from uploadOnCloudinary before accessing .url
    // Previously `if (!coverImage.url)` would throw a TypeError crash when coverImage is null
    if (!coverImage || !coverImage.url) {
        throw new ApiError(400, "Error while uploading the Cover Image");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url,
            },
        },
        { new: true }
    ).select("-password");

    return res
        .status(200)
        .json(new ApiResponse(200, user, " Cover image updated successfully"));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
    // 1. Receive: Extract the 'username' we want to look up from the URL parameters.
    // 2. Validate: If they didn't provide a username, throw an error.
    // 3. Database (Pipeline): Start the aggregation assembly line on the User model.
    //    - Stage 1 ($match): Find the user with this exact username.
    //    - Stage 2 ($lookup): Fetch all their subscribers from the Subscriptions collection.
    //    - Stage 3 ($lookup): Fetch all the channels they subscribe to.
    //    - Stage 4 ($addFields): Count the arrays to get the exact subscriber numbers, and check if the logged-in user is in the subscriber list.
    //    - Stage 5 ($project): Clean up the final object, keeping only public fields like name, avatar, and our new counts.
    // 4. Validate: The pipeline returns an array. If it's empty, the user doesn't exist, so throw a 404 error.
    // 5. Respond: Send a 200 Success status, sending ONLY the first item in the array (channel[0]).

    const { username } = req.params;

    if (!username?.trim()) {
        throw new ApiError(400, "username is missing");
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase(),
            },
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers",
            },
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo",
            },
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers",
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo",
                },
                isSubscribed: {
                    $cond: {
                        if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                        then: true,
                        else: false,
                    },
                },
            },
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1,
            },
        },
    ]);

    if (!channel?.length) {
        throw new ApiError(404, "Channel does not exists");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                channel[0],
                "User channel fetched successfully"
            )
        );
});

const searchChannels = asyncHandler(async (req, res) => {
    const { q } = req.query;

    if (!q?.trim()) {
        throw new ApiError(400, "Search query is required");
    }

    if (q.trim().length < 2) {
        throw new ApiError(400, "Query must be at least 2 characters");
    }

    const users = await User.find({
        $or: [
            { username: { $regex: q.trim(), $options: "i" } },
            { fullName: { $regex: q.trim(), $options: "i" } },
        ],
    })
        .select("username fullName avatar")
        .limit(8)
        .lean();

    return res.status(200).json(new ApiResponse(200, users, "Channels found"));
});

const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id),
            },
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    // Only include published videos
                    { $match: { isPublished: true } },
                    // Join owner info
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
                    // Flatten owner array → object
                    { $addFields: { owner: { $first: "$owner" } } },
                    // Project only what frontend needs
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
    ]);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                user[0]?.watchHistory ?? [],
                "Watch history fetched successfully"
            )
        );
});

export {
    registerUser,
    verifyEmail,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory,
    searchChannels,
};
