
"use strict";

const express = require("express");
const router = express.Router();

const documentController = require("../controllers/documentController");

const {
    requireAuth,
    requireRole
} = require("../middleware/authMiddleware");

const uploadMiddleware = require("../middleware/documentUpload");

const hrRoles = [
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE"
];

// -----------------------------------------------------
// MIDDLEWARE VALIDATION
// -----------------------------------------------------

if (typeof requireAuth !== "function") {
    throw new TypeError(
        "authMiddleware must export requireAuth as a function."
    );
}

if (typeof requireRole !== "function") {
    throw new TypeError(
        "authMiddleware must export requireRole as a function."
    );
}

if (
    !Array.isArray(uploadMiddleware) ||
    !uploadMiddleware.every(
        (middleware) => typeof middleware === "function"
    )
) {
    throw new TypeError(
        "documentUpload.js must export an array of upload middleware functions."
    );
}

const requireHR = requireRole(...hrRoles);

// -----------------------------------------------------
// GET /documents
// Document dashboard
// -----------------------------------------------------

router.get(
    "/",
    requireAuth,
    requireHR,
    documentController.getIndex
);

// -----------------------------------------------------
// GET /documents/upload
// Upload form
// -----------------------------------------------------

router.get(
    "/upload",
    requireAuth,
    requireHR,
    documentController.getUpload
);

// -----------------------------------------------------
// POST /documents/upload
// Upload document
// -----------------------------------------------------

router.post(
    "/upload",
    requireAuth,
    requireHR,
    ...uploadMiddleware,
    documentController.uploadDocument
);

// -----------------------------------------------------
// GET /documents/:id/download
// Download private document
// Must be declared before GET /:id
// -----------------------------------------------------

router.get(
    "/:id/download",
    requireAuth,
    requireHR,
    documentController.downloadDocument
);

// -----------------------------------------------------
// POST /documents/:id/review
// Approve or reject document
// -----------------------------------------------------

router.post(
    "/:id/review",
    requireAuth,
    requireHR,
    documentController.reviewDocument
);

// -----------------------------------------------------
// GET /documents/:id
// Document details
// Keep this route last
// -----------------------------------------------------

router.get(
    "/:id",
    requireAuth,
    requireHR,
    documentController.getDetails
);

// -----------------------------------------------------
// EXPORT
// -----------------------------------------------------

module.exports = router;
