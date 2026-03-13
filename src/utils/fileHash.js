import crypto from "crypto";
import fs from "fs";

export const generateFileHash = (filePath) => {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256"); // SHA-256 is the standard hashing algorithm
        const stream = fs.createReadStream(filePath); // Read the file piece by piece

        stream.on("data", (data) => {
            hash.update(data); // Feed each piece into the hasher
        });

        stream.on("end", () => {
            resolve(hash.digest("hex")); // When done, output the final fingerprint as a string
        });

        stream.on("error", (error) => {
            reject(error);
        });
    });
};
