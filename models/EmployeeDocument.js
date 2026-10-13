
"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png"
];

const employeeDocumentSchema = new Schema(
    {
        // ================================================
        // ORGANIZATION / TENANT
        // ================================================

        organization: {
            type: Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true,
            immutable: true
        },

        // ================================================
        // DOCUMENT OWNER
        // ================================================

        employee: {
            type: Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
            index: true
        },

        onboarding: {
            type: Schema.Types.ObjectId,
            ref: "Onboarding",
            default: null,
            index: true
        },

        // ================================================
        // DOCUMENT INFORMATION
        // ================================================

        documentType: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },

        originalName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 255
        },

        mimeType: {
            type: String,
            required: true,
            enum: ALLOWED_MIME_TYPES
        },

        size: {
            type: Number,
            required: true,
            min: 1,
            max: MAX_DOCUMENT_SIZE,
            validate: {
                validator: Number.isSafeInteger,
                message: "Document size must be a valid integer."
            }
        },

        // ================================================
        // CLOUDINARY STORAGE
        // ================================================

        storageProvider: {
            type: String,
            enum: ["cloudinary"],
            default: "cloudinary",
            required: true,
            immutable: true
        },

        // Cloudinary public_id.
        // Keep private storage identifiers out of normal queries.
        storageKey: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500,
            select: false,
            immutable: true
        },

        // Store the actual format returned by Cloudinary.
        // Do not assume it is always the original filename extension.
        storageFormat: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            maxlength: 20,
            select: false,
            immutable: true
        },

        // ================================================
        // REVIEW WORKFLOW
        // ================================================

        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING",
            required: true,
            index: true
        },

        uploadedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            immutable: true
        },

        uploadedAt: {
            type: Date,
            default: Date.now,
            required: true,
            immutable: true
        },

        reviewedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        reviewedAt: {
            type: Date,
            default: null
        },

        rejectionReason: {
            type: String,
            trim: true,
            default: "",
            maxlength: 1000
        }
    },
    {
        timestamps: true,
        versionKey: "__v",
        strict: true,
        minimize: true
    }
);

// ================================================
// VALIDATION
// ================================================

employeeDocumentSchema.pre("validate", function () {
    if (!this.employee && !this.onboarding) {
        this.invalidate(
            "employee",
            "A document must belong to an employee or onboarding record."
        );
    }

    if (this.status === "REJECTED" && !this.rejectionReason?.trim()) {
        this.invalidate(
            "rejectionReason",
            "A rejection reason is required when rejecting a document."
        );
    }

    if (
        this.status === "PENDING" &&
        (this.reviewedBy || this.reviewedAt)
    ) {
        this.invalidate(
            "status",
            "A pending document cannot have review details."
        );
    }

    if (
        this.status === "APPROVED" &&
        (!this.reviewedBy || !this.reviewedAt)
    ) {
        this.invalidate(
            "status",
            "An approved document must have reviewer details."
        );
    }

    if (this.status === "REJECTED" && (!this.reviewedBy || !this.reviewedAt)) {
        this.invalidate(
            "status",
            "A rejected document must have reviewer details."
        );
    }
});

// ================================================
// INDEXES
// ================================================

// Organization document review queue
employeeDocumentSchema.index({
    organization: 1,
    status: 1,
    createdAt: -1
});

// Employee document history
employeeDocumentSchema.index({
    organization: 1,
    employee: 1,
    createdAt: -1
});

// Onboarding document history
employeeDocumentSchema.index({
    organization: 1,
    onboarding: 1,
    createdAt: -1
});

// Prevent duplicate storage identifiers within an organization
employeeDocumentSchema.index(
    {
        organization: 1,
        storageKey: 1
    },
    {
        unique: true,
        name: "unique_organization_storage_key"
    }
);

// ================================================
// MODEL EXPORT
// ================================================

module.exports =
    mongoose.models.EmployeeDocument ||
    mongoose.model("EmployeeDocument", employeeDocumentSchema);
