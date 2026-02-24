import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

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

    const existedUser = await User.findOne({
        $or: [{ username }, { email }],
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

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase(),
    });

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
            new ApiResponse(200, createdUser, "User registered Successfully")
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
    console.log(email);

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

const getCurentUser = asyncHandler(async (req, res) => {
    // 1. Receive: Get the user details that the Auth Middleware already attached to the request (req.user).
    // 2. Respond: Send a 200 Success status returning that exact user data.

    return res
        .status(200)
        .json(200, req.user, "current user fetched successfully");
});

const updateAccountDetails = asyncHandler(async (req, res) => {
    // 1. Receive: Get the new fullName and email from the request body.
    // 2. Validate: Are they empty? If so, throw an error.
    // 3. Database: Find the user by ID and update their fullName and email fields. Return the new updated document (without the password).
    // 4. Respond: Send a 200 Success status with the updated user data.

    const { fullName, email } = req.body;

    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email,
            },
        },
        { new: true }
    ).select("-password");

    return res
        .status(200)
        .json(
            new ApiResponse(200, user, "Account details update successfully")
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
        throw new ApiEoor(400, "Avatar file is missing");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar.url) {
        throw new ApiEoor(400, "Error while uploading the avatar");
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
        throw new ApiEoor(400, "Cover image file is missing");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!coverImage.url) {
        throw new ApiEoor(400, "Error while uploading the Cover Image");
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

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
};
