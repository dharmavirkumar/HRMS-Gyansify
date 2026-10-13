
"use strict";

const crypto = require("crypto");
const path = require("path");
const mongoose = require("mongoose");

const EmployeeDocument = require("../models/EmployeeDocument");
const Employee = require("../models/Employee");
const Onboarding = require("../models/Onboarding");
const documentStorage = require("../services/documentStorage");
const cloudinary = require("../config/cloudinary");
// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------

function getUser(req) {
    return req.session?.user || {};
}

function getId(value) {
    if (!value) return null;

    if (typeof value === "object") {
        return value._id || value.id || null;
    }

    return value;
}

function getOrganizationId(req) {
    const user = getUser(req);

    return getId(
        user.organizationId ||
        user.organization ||
        user.organizationID
    );
}

function getUserId(req) {
    const user = getUser(req);

    return getId(user._id || user.id || user.userId);
}

function validId(value) {
    return Boolean(
        value && mongoose.isValidObjectId(String(value))
    );
}

function cleanFileName(value) {
    return path.basename(String(value || "document"))
        .replace(/[\r\n"]/g, "_")
        .slice(0, 200);
}

function getExtension(mimeType) {
    const extensions = {
        "application/pdf": "pdf",
        "image/jpeg": "jpg",
        "image/png": "png"
    };

    return extensions[mimeType] || null;
}

function renderError(res, status, message) {
    return res.status(status).send(message);
}

function validOrganizationAndUser(req) {
    return (
        validId(getOrganizationId(req)) &&
        validId(getUserId(req))
    );
}

function getSafeDocumentType(value) {
    if (typeof value !== "string") return "";

    return value.trim().replace(/\s+/g, " ");
}

function getCloudStorageKey(uploadResult) {
    return (
        uploadResult?.public_id ||
        uploadResult?.storageKey ||
        uploadResult?.key ||
        null
    );
}

function getCloudStorageFormat(uploadResult, extension) {
    return (
        uploadResult?.format ||
        uploadResult?.storageFormat ||
        extension
    );
}

// -----------------------------------------------------
// GET /documents
// Document dashboard
// -----------------------------------------------------

exports.getIndex = async (req, res, next) => {
    try {
        const organizationId = getOrganizationId(req);

        if (!validId(organizationId)) {
            return renderError(
                res,
                403,
                "Your account has no valid organization."
            );
        }

        const allowedStatuses = [
            "PENDING",
            "APPROVED",
            "REJECTED"
        ];

        const requestedStatus = String(
            req.query.status || ""
        ).trim().toUpperCase();

        const currentStatus = allowedStatuses.includes(
            requestedStatus
        )
            ? requestedStatus
            : "";

        const filter = {
            organization: organizationId
        };

        if (currentStatus) {
            filter.status = currentStatus;
        }

        const [
            documents,
            total,
            pending,
            approved,
            rejected
        ] = await Promise.all([
            EmployeeDocument.find(filter)
                .sort({ createdAt: -1 })
                .limit(200)
                .populate(
                    "employee",
                    "employeeId firstName lastName email"
                )
                .populate(
                    "onboarding",
                    "firstName lastName email joiningDate"
                )
                .populate("uploadedBy", "name email")
                .populate("reviewedBy", "name email")
                .lean(),

            EmployeeDocument.countDocuments({
                organization: organizationId
            }),

            EmployeeDocument.countDocuments({
                organization: organizationId,
                status: "PENDING"
            }),

            EmployeeDocument.countDocuments({
                organization: organizationId,
                status: "APPROVED"
            }),

            EmployeeDocument.countDocuments({
                organization: organizationId,
                status: "REJECTED"
            })
        ]);

        return res.render("documents/index", {
            title: "Document Management",
            user: getUser(req),
            documents,
            currentStatus,
            stats: {
                total,
                pending,
                approved,
                rejected
            }
        });
    } catch (error) {
        console.error("Document Dashboard Error:", error);
        return next(error);
    }
};

// -----------------------------------------------------
// GET /documents/upload
// Upload form
// -----------------------------------------------------

exports.getUpload = async (req, res, next) => {
    try {
        const organizationId = getOrganizationId(req);

        if (!validId(organizationId)) {
            return renderError(
                res,
                403,
                "Invalid organization."
            );
        }

        const [employees, onboardings] = await Promise.all([
            Employee.find({
                organization: organizationId,
                status: { $ne: "Exited" }
            })
                .sort({ firstName: 1, lastName: 1 })
                .select("_id employeeId firstName lastName email")
                .lean(),

            Onboarding.find({
                organization: organizationId,
                status: {
                    $in: [
                        "DRAFT",
                        "IN_PROGRESS",
                        "PENDING_APPROVAL",
                        "APPROVED"
                    ]
                }
            })
                .sort({ createdAt: -1 })
                .select(
                    "_id firstName lastName email joiningDate status employee"
                )
                .lean()
        ]);

        return res.render("documents/upload", {
            title: "Upload Employee Document",
            user: getUser(req),
            employees,
            onboardings
        });
    } catch (error) {
        console.error("Document Upload Form Error:", error);
        return next(error);
    }
};

// -----------------------------------------------------
// POST /documents/upload
// Upload to private Cloudinary storage
// -----------------------------------------------------

exports.uploadDocument = async (req, res, next) => {
    let storageKey = null;
    let uploadedToCloud = false;

    try {
        const organizationId = getOrganizationId(req);
        const userId = getUserId(req);

        if (!validId(organizationId) || !validId(userId)) {
            return renderError(
                res,
                403,
                "Your session or organization could not be verified."
            );
        }

        // The upload middleware must validate file size,
        // MIME type and file signature before this controller.
        if (!req.file || !Buffer.isBuffer(req.file.buffer)) {
            return renderError(
                res,
                400,
                "Please choose a valid document to upload."
            );
        }

        const targetType = String(
            req.body.targetType || ""
        ).trim();

        const documentType = getSafeDocumentType(
            req.body.documentType
        );

        if (!["employee", "onboarding"].includes(targetType)) {
            return renderError(
                res,
                400,
                "Select an employee or onboarding record."
            );
        }

        if (
            !documentType ||
            documentType.length > 100
        ) {
            return renderError(
                res,
                400,
                "Document type is required and must not exceed 100 characters."
            );
        }

        const originalName = cleanFileName(
            req.file.originalname
        );

        const mimeType = req.file.mimetype;
        const extension = getExtension(mimeType);

        if (!extension) {
            return renderError(
                res,
                400,
                "Unsupported document type."
            );
        }

        let employeeId = null;
        let onboardingId = null;

        if (targetType === "employee") {
            employeeId = String(
                req.body.employeeId || ""
            ).trim();

            if (!validId(employeeId)) {
                return renderError(
                    res,
                    400,
                    "Please select a valid employee."
                );
            }

            const employee = await Employee.findOne({
                _id: employeeId,
                organization: organizationId,
                status: { $ne: "Exited" }
            }).select("_id");

            if (!employee) {
                return renderError(
                    res,
                    404,
                    "Active employee not found in your organization."
                );
            }
        }

        if (targetType === "onboarding") {
            const requestedOnboardingId = String(
                req.body.onboardingId || ""
            ).trim();

            if (!validId(requestedOnboardingId)) {
                return renderError(
                    res,
                    400,
                    "Please select a valid onboarding record."
                );
            }

            const onboarding = await Onboarding.findOne({
                _id: requestedOnboardingId,
                organization: organizationId,
                status: {
                    $in: [
                        "DRAFT",
                        "IN_PROGRESS",
                        "PENDING_APPROVAL",
                        "APPROVED"
                    ]
                }
            }).select("_id employee");

            if (!onboarding) {
                return renderError(
                    res,
                    404,
                    "Onboarding record not found or is not active."
                );
            }

            onboardingId = onboarding._id;

            // Link the document to the employee when the
            // onboarding record already references one.
            if (onboarding.employee) {
                const linkedEmployee = await Employee.findOne({
                    _id: onboarding.employee,
                    organization: organizationId
                }).select("_id");

                if (linkedEmployee) {
                    employeeId = linkedEmployee._id;
                }
            }
        }

        const document = new EmployeeDocument({
            organization: organizationId,
            employee: employeeId,
            onboarding: onboardingId,
            documentType,
            originalName,
            mimeType,
            size: req.file.size,
            status: "PENDING",
            uploadedBy: userId
        });

        // Use a random key. Do not use the user's filename
        // as a Cloudinary public ID.
        const requestedKey =
            `organizations/${organizationId}/documents/` +
            `${document._id}/${crypto.randomUUID()}`;

        // Contract: uploadFile returns Cloudinary's upload
        // result, including public_id and format.
        const uploadResult = await documentStorage.uploadFile({
            key: requestedKey,
            buffer: req.file.buffer,
            mimeType,
            originalName
        });

        uploadedToCloud = true;

        storageKey = getCloudStorageKey(uploadResult);

        const storageFormat = getCloudStorageFormat(
            uploadResult,
            extension
        );

        if (!storageKey || !storageFormat) {
            throw new Error(
                "Cloud storage did not return public_id and format."
            );
        }

        document.storageKey = storageKey;
        document.storageFormat = storageFormat;
        document.storageProvider = "cloudinary";

        await document.save();

        return res.redirect(
            `/documents/${document._id}`
        );
    } catch (error) {
        // Clean up the Cloudinary asset if the database save
        // fails after a successful upload.
        if (uploadedToCloud && storageKey) {
            try {
                await documentStorage.deleteFile(storageKey);
            } catch (cleanupError) {
                console.error(
                    "Document Storage Cleanup Error:",
                    cleanupError
                );
            }
        }

        if (
            error?.name === "ValidationError" ||
            error?.name === "CastError"
        ) {
            return renderError(
                res,
                400,
                "Document information is invalid. Please check the form and try again."
            );
        }

        console.error("Document Upload Error:", error);
        return next(error);
    }
};

// -----------------------------------------------------
// GET /documents/:id
// Document details
// -----------------------------------------------------

exports.getDetails = async (req, res, next) => {
    try {
        const organizationId = getOrganizationId(req);
        const documentId = req.params.id;

        if (!validId(organizationId)) {
            return renderError(
                res,
                403,
                "Invalid organization."
            );
        }

        if (!validId(documentId)) {
            return renderError(
                res,
                400,
                "Invalid document ID."
            );
        }

        const document = await EmployeeDocument.findOne({
            _id: documentId,
            organization: organizationId
        })
            .populate(
                "employee",
                "employeeId firstName lastName email"
            )
            .populate(
                "onboarding",
                "firstName lastName email joiningDate"
            )
            .populate("uploadedBy", "name email")
            .populate("reviewedBy", "name email")
            .lean();

        if (!document) {
            return renderError(
                res,
                404,
                "Document not found."
            );
        }

        return res.render("documents/show", {
            title: "Document Details",
            user: getUser(req),
            document
        });
    } catch (error) {
        console.error("Document Details Error:", error);
        return next(error);
    }
};


// -----------------------------------------------------
// GET /documents/:id/download
// Authenticated private download
// -----------------------------------------------------

exports.downloadDocument = async (req, res, next) => {
    try {
        const organizationId = getOrganizationId(req);
        const documentId = req.params.id;

        if (
            !validId(organizationId) ||
            !validId(documentId)
        ) {
            return renderError(res, 400, "Invalid request.");
        }

        const document = await EmployeeDocument.findOne({
            _id: documentId,
            organization: organizationId
        }).select("+storageKey +storageFormat");

        if (!document) {
            return renderError(res, 404, "Document not found.");
        }

        if (document.storageProvider !== "cloudinary") {
            return renderError(
                res,
                500,
                "This document uses an unsupported storage provider."
            );
        }

        if (
            !document.storageKey ||
            !document.storageFormat
        ) {
            console.error("Document storage metadata missing:", {
                documentId: String(document._id),
                hasStorageKey: Boolean(document.storageKey),
                hasStorageFormat: Boolean(document.storageFormat)
            });

            return renderError(
                res,
                409,
                "Document storage details are incomplete. Please re-upload this document or repair its storage metadata."
            );
        }

        if (
            typeof documentStorage.getPrivateDownloadUrl !== "function"
        ) {
            return renderError(
                res,
                500,
                "Private document downloads are not configured."
            );
        }

        // IMPORTANT: Pass the two arguments expected by
        // services/documentStorage.js.
        const downloadUrl =
            await documentStorage.getPrivateDownloadUrl(
                document.storageKey,
                document.storageFormat
            );

        if (
            typeof downloadUrl !== "string" ||
            !downloadUrl.startsWith("https://")
        ) {
            throw new Error(
                "Storage service returned an invalid download URL."
            );
        }

        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("X-Content-Type-Options", "nosniff");

        return res.redirect(downloadUrl);
    } catch (error) {
        console.error("Document Download Error:", error);
        return next(error);
    }
};


// -----------------------------------------------------
// POST /documents/:id/review
// HR approval/rejection
// -----------------------------------------------------

exports.reviewDocument = async (req, res, next) => {
    try {
        const organizationId = getOrganizationId(req);
        const userId = getUserId(req);
        const documentId = req.params.id;

        if (
            !validId(organizationId) ||
            !validId(userId) ||
            !validId(documentId)
        ) {
            return renderError(
                res,
                400,
                "Invalid request."
            );
        }

        const action = String(
            req.body.action || ""
        ).trim().toLowerCase();

        const rejectionReason = String(
            req.body.rejectionReason || ""
        ).trim();

        if (!["approve", "reject"].includes(action)) {
            return renderError(
                res,
                400,
                "Invalid review action."
            );
        }

        if (
            action === "reject" &&
            (
                !rejectionReason ||
                rejectionReason.length > 1000
            )
        ) {
            return renderError(
                res,
                400,
                "A rejection reason is required and must not exceed 1000 characters."
            );
        }

        const update = {
            status: action === "approve" ? "APPROVED" : "REJECTED",
            reviewedBy: userId,
            reviewedAt: new Date(),
            rejectionReason:
                action === "reject" ? rejectionReason : ""
        };

        // Atomic condition prevents two HR users from reviewing
        // the same document while it is still pending.
        const document = await EmployeeDocument.findOneAndUpdate(
            {
                _id: documentId,
                organization: organizationId,
                status: "PENDING"
            },
            {
                $set: update
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!document) {
            const existing = await EmployeeDocument.exists({
                _id: documentId,
                organization: organizationId
            });

            if (!existing) {
                return renderError(
                    res,
                    404,
                    "Document not found."
                );
            }

            return renderError(
                res,
                409,
                "This document has already been reviewed."
            );
        }

        return res.redirect(
            `/documents/${document._id}`
        );
    } catch (error) {
        console.error("Document Review Error:", error);
        return next(error);
    }
};
