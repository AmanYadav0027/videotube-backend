import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null;
        // upload the file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
            secure: true, // force https on the returned URL
        });
        //file has been uploaded successfully
        // console.log("file is uploaded on cloudinary", response.url);
        fs.unlinkSync(localFilePath);

        // Overwrite url with secure_url so every controller that reads
        // response.url gets https:// regardless of Cloudinary account settings
        response.url = response.secure_url;

        return response;
    } catch (error) {
        console.error("[cloudinary] Upload failed:", error.message);
        fs.unlinkSync(localFilePath); // remove the locally saved temporary file as the upload operation got failed
        return null;
    }
};

const deleteFromCloudinary = async (cloudinaryUrl, resourceType = "image") => {
    try {
        if (!cloudinaryUrl) return null;

        const urlArray = cloudinaryUrl.split("/");

        const publicIdWithExtension = urlArray[urlArray.length - 1];

        const publicId = publicIdWithExtension.split(".")[0];

        const response = await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
        });

        return response;
    } catch (error) {
        console.log("error deleting from cloudinary", error);
        return null;
    }
};

export { uploadOnCloudinary, deleteFromCloudinary };
