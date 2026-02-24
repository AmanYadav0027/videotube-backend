import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.models.js";

export const verifyJWT = asyncHandler(async (req, _, next) => {
    // 1. Receive: Try to find the Access Token inside the user's cookies OR inside their request headers.
    // 2. Validate: If no token is found, throw a 401 Unauthorized error (stop the request entirely).
    // 3. Process: Use our secret key to decode the token. This reveals the payload (which contains the user's ID).
    // 4. Database: Find the user in the database using that decoded ID, making sure to strip out the password and refresh token.
    // 5. Validate: If the user doesn't exist in the database anymore (maybe they were deleted), throw an error.
    // 6. Magic Step: Attach this clean user data directly to the request object (req.user = user).
    // 7. Proceed: Call next() to tell Express "This person is legit, move on to the actual controller!"

    try {
        const token =
            req.cookies?.accessToken ||
            req.header("Authorization")?.replace("Bearer ", "");

        if (!token) {
            throw new ApiError(401, "Unauthorized request");
        }

        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

        const user = await User.findById(decodedToken?._id).select(
            "-password -refreshToken"
        );

        if (!user) {
            throw new ApiError(401, "Invalid Access Token");
        }

        req.user = user;
        next();
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid access Token");
    }
});
