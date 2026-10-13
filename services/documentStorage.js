
"use strict";

const path = require("path");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

function validateConfig() {
    const {
        CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_API_KEY,
        CLOUDINARY_API_SECRET
    } = process.env;

    if (
        !CLOUDINARY_CLOUD_NAME ||
        !CLOUDINARY_API_KEY ||
        !CLOUDINARY_API_SECRET
    ) {
        throw new Error(
            "Cloudinary configuration is incomplete. Check your .env file."
        );
    }
}

function getFileExtension(originalName, mimeType) {
    const extension = path
        .extname(originalName || "")
        .replace(".", "")
        .toLowerCase();

    if (["pdf", "jpg", "jpeg", "png"].includes(extension)) {
        return extension;
    }

    const mimeExtensions = {
        "application/pdf": "pdf",
        "image/jpeg": "jpg",
        "image/png": "png"
    };

    return mimeExtensions[mimeType] || null;
}

async function uploadFile({
    key,
    buffer,
    mimeType,
    originalName
}) {
    validateConfig();

    if (!key || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error("Invalid document upload input.");
    }

    const extension = getFileExtension(originalName, mimeType);

    if (!extension) {
        throw new Error("Unsupported document file format.");
    }

    // Raw Cloudinary assets should include the file extension
    // in their public ID.
    const basePublicId = key.replace(/\.[^.]+$/, "");
    const publicId = `${basePublicId}.${extension}`;

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                public_id: publicId,
                resource_type: "raw",
                type: "authenticated",
                overwrite: false,
                unique_filename: false,
                use_filename: false,
                context: {
                    application: "gyansify-hrms",
                    mime_type: mimeType
                }
            },
            (error, result) => {
                if (error) {
                    return reject(error);
                }

                if (!result || !result.public_id) {
                    return reject(
                        new Error(
                            "Cloudinary did not return a public ID."
                        )
                    );
                }

                // Return the exact property names expected by
                // documentController.js, alongside useful metadata.
                resolve({
                    public_id: result.public_id,
                    format: result.format || extension,

                    publicId: result.public_id,
                    assetId: result.asset_id,
                    resourceType: result.resource_type,
                    deliveryType: result.type,
                    bytes: result.bytes
                });
            }
        );

        stream.on("error", reject);
        stream.end(buffer);
    });
}

async function deleteFile(publicId) {
    validateConfig();

    if (!publicId) {
        throw new Error("Cloudinary public ID is required for deletion.");
    }

    return cloudinary.uploader.destroy(publicId, {
        resource_type: "raw",
        type: "authenticated",
        invalidate: true
    });
}

function getPrivateDownloadUrl(publicId, format) {
    validateConfig();

    if (!publicId || !format) {
        throw new Error(
            "Cloudinary public ID and document format are required."
        );
    }

    return cloudinary.utils.private_download_url(
        publicId,
        format,
        {
            resource_type: "raw",
            type: "authenticated",
            attachment: true
        }
    );
}

module.exports = {
    uploadFile,
    deleteFile,
    getPrivateDownloadUrl
};
