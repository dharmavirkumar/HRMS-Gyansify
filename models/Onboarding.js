
"use strict";

const mongoose = require("mongoose");

const { Schema } = mongoose;

// =====================================================
// ONBOARDING TASK SCHEMA
// =====================================================

const onboardingTaskSchema = new Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150
        },

        description: {
            type: String,
            trim: true,
            default: "",
            maxlength: 1000
        },

        category: {
            type: String,
            enum: [
                "HR",
                "DOCUMENTS",
                "IT",
                "MANAGER",
                "TRAINING",
                "OTHER"
            ],
            default: "HR",
            index: true
        },

        assignedTo: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        status: {
            type: String,
            enum: [
                "PENDING",
                "IN_PROGRESS",
                "COMPLETED",
                "BLOCKED"
            ],
            default: "PENDING",
            index: true
        },

        dueDate: {
            type: Date,
            default: null
        },

        startedAt: {
            type: Date,
            default: null
        },

        completedAt: {
            type: Date,
            default: null
        },

        remarks: {
            type: String,
            trim: true,
            default: "",
            maxlength: 1000
        },

        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null
        }
    },
    {
        timestamps: true
    }
);

// =====================================================
// ONBOARDING DOCUMENT SCHEMA
// =====================================================

const onboardingDocumentSchema = new Schema(
    {
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

        // Server-generated storage key/path.
        // Never use an untrusted client path as this value.
        storageKey: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500
        },

        mimeType: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },

        size: {
            type: Number,
            required: true,
            min: 1
        },

        status: {
            type: String,
            enum: [
                "PENDING",
                "APPROVED",
                "REJECTED"
            ],
            default: "PENDING",
            index: true
        },

        uploadedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        uploadedAt: {
            type: Date,
            default: Date.now
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
        timestamps: true
    }
);

// =====================================================
// MAIN ONBOARDING SCHEMA
// =====================================================

const onboardingSchema = new Schema(
    {
        // ---------------------------------------------
        // ORGANIZATION
        // ---------------------------------------------

        organization: {
            type: Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true
        },

        // ---------------------------------------------
        // EMPLOYEE LINK
        // Null until onboarding is converted to employee
        // ---------------------------------------------

        employee: {
            type: Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
            index: true
        },

        // ---------------------------------------------
        // PERSONAL INFORMATION
        // ---------------------------------------------

        firstName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },

        lastName: {
            type: String,
            trim: true,
            default: "",
            maxlength: 100
        },

        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            maxlength: 254,
            match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            index: true
        },

        phone: {
            type: String,
            trim: true,
            default: "",
            maxlength: 25
        },

        // ---------------------------------------------
        // JOB INFORMATION
        // ---------------------------------------------

        joiningDate: {
            type: Date,
            required: true,
            index: true
        },

        employmentType: {
            type: String,
            enum: [
                "Permanent",
                "Probation",
                "Contract",
                "Intern",
                "Part Time"
            ],
            default: "Permanent"
        },

        department: {
            type: Schema.Types.ObjectId,
            ref: "Department",
            default: null
        },

        designation: {
            type: Schema.Types.ObjectId,
            ref: "Designation",
            default: null
        },

        reportingManager: {
            type: String,
            trim: true,
            default: "",
            maxlength: 150
        },

        // ---------------------------------------------
        // ONBOARDING WORKFLOW
        // ---------------------------------------------

        status: {
            type: String,
            enum: [
                "DRAFT",
                "IN_PROGRESS",
                "PENDING_APPROVAL",
                "APPROVED",
                "REJECTED",
                "COMPLETED",
                "CANCELLED"
            ],
            default: "DRAFT",
            index: true
        },

        tasks: {
            type: [onboardingTaskSchema],
            default: []
        },

        documents: {
            type: [onboardingDocumentSchema],
            default: []
        },

        // ---------------------------------------------
        // AUDIT INFORMATION
        // ---------------------------------------------

        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        approvedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        approvedAt: {
            type: Date,
            default: null
        },

        rejectedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        rejectedAt: {
            type: Date,
            default: null
        },

        rejectionReason: {
            type: String,
            trim: true,
            default: "",
            maxlength: 1000
        },

        completedAt: {
            type: Date,
            default: null
        },

        cancelledAt: {
            type: Date,
            default: null
        },

        // ---------------------------------------------
        // NOTES
        // ---------------------------------------------

        notes: {
            type: String,
            trim: true,
            default: "",
            maxlength: 3000
        }
    },
    {
        timestamps: true,
        versionKey: "__v",
        strict: true,
        minimize: false
    }
);

// =====================================================
// INDEXES
// =====================================================

// Organization dashboard filtering and sorting.
onboardingSchema.index({
    organization: 1,
    status: 1,
    createdAt: -1
});

// Organization joining-date reports.
onboardingSchema.index({
    organization: 1,
    joiningDate: 1
});

// Organization-specific email lookup.
// This is a non-unique index because historical records
// may contain the same email.
onboardingSchema.index({
    organization: 1,
    email: 1
});

// Department/designation reporting.
onboardingSchema.index({
    organization: 1,
    department: 1,
    designation: 1
});

// Task assignment queries.
onboardingSchema.index({
    organization: 1,
    "tasks.assignedTo": 1,
    "tasks.status": 1
});

// =====================================================
// VALIDATION
// =====================================================

onboardingSchema.pre("validate", function (next) {
    if (this.email) {
        this.email = this.email.trim().toLowerCase();
    }

    if (this.firstName) {
        this.firstName = this.firstName.trim();
    }

    if (this.lastName) {
        this.lastName = this.lastName.trim();
    }

    // A completed onboarding must have a completion date.
    if (this.status === "COMPLETED" && !this.completedAt) {
        this.completedAt = new Date();
    }

    // Record completion timestamp when every task is completed.
    // This does not automatically approve the onboarding.
    if (
        Array.isArray(this.tasks) &&
        this.tasks.length > 0 &&
        this.tasks.every((task) => task.status === "COMPLETED")
    ) {
        // Task completion alone does not change onboarding status.
        // The controller should decide when the workflow is complete.
    }

    next();
});

// =====================================================
// VIRTUALS
// =====================================================

onboardingSchema.virtual("fullName").get(function () {
    return [this.firstName, this.lastName]
        .filter(Boolean)
        .join(" ");
});

onboardingSchema.virtual("isCompleted").get(function () {
    return this.status === "COMPLETED";
});

onboardingSchema.virtual("pendingTasksCount").get(function () {
    if (!Array.isArray(this.tasks)) return 0;

    return this.tasks.filter(
        (task) => task.status !== "COMPLETED"
    ).length;
});

onboardingSchema.virtual("pendingDocumentsCount").get(function () {
    if (!Array.isArray(this.documents)) return 0;

    return this.documents.filter(
        (document) => document.status === "PENDING"
    ).length;
});

// Include virtuals when converting documents to JSON/objects.
onboardingSchema.set("toJSON", {
    virtuals: true
});

onboardingSchema.set("toObject", {
    virtuals: true
});

// =====================================================
// EXPORT
// =====================================================

module.exports =
    mongoose.models.Onboarding ||
    mongoose.model("Onboarding", onboardingSchema);
