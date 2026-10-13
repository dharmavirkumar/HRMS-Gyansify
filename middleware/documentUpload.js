
"use strict";

const multer = require("multer");

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png"
];

const FILE_SIGNATURES = {
    "application/pdf": [
        Buffer.from("%PDF-")
    ],
    "image/jpeg": [
        Buffer.from([0xff, 0xd8, 0xff])
    ],
    "image/png": [
        Buffer.from([
            0x89, 0x50, 0x4e, 0x47,
            0x0d, 0x0a, 0x1a, 0x0a
        ])
    ]
};

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1,
        fields: 20,
        parts: 25
    },
    fileFilter(req, file, callback) {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            const error = new Error(
                "Only PDF, JPEG and PNG files are allowed."
            );

            error.status = 400;
            return callback(error);
        }

        callback(null, true);
    }
});

function validateFileSignature(file) {
    if (!file || !Buffer.isBuffer(file.buffer)) {
        return false;
    }

    const signatures = FILE_SIGNATURES[file.mimetype];

    if (!signatures) {
        return false;
    }

    return signatures.some((signature) =>
        file.buffer
            .subarray(0, signature.length)
            .equals(signature)
    );
}

function verifyFileSignature(req, res, next) {
    if (!req.file) {
        return res.status(400).send(
            "Please select a document to upload."
        );
    }

    if (!validateFileSignature(req.file)) {
        return res.status(400).send(
            "The file contents do not match the selected file type."
        );
    }

    next();
}

// Export an array of Express middleware functions.
const uploadDocument = [
    upload.single("document"),
    verifyFileSignature
];

module.exports = uploadDocument;

// Allow the controller to import the validation helper.
module.exports.validateFileSignature = validateFileSignature;
