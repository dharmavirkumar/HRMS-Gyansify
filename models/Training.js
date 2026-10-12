const mongoose = require("mongoose");


// =====================================================
// TRAINING SCHEMA
// =====================================================

const trainingSchema = new mongoose.Schema(
    {

        // =================================================
        // ORGANIZATION
        // =================================================

        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true
        },


        // =================================================
        // BASIC INFORMATION
        // =================================================

        trainingId: {
            type: String,
            required: true,
            trim: true
        },

        title: {
            type: String,
            required: true,
            trim: true
        },

        category: {
            type: String,
            required: true,
            enum: [
                "TECHNICAL",
                "SOFT_SKILLS",
                "LEADERSHIP",
                "COMPLIANCE",
                "ONBOARDING",
                "OTHER"
            ],
            default: "OTHER"
        },

        trainingType: {
            type: String,
            required: true,
            enum: [
                "IN_PERSON",
                "ONLINE",
                "HYBRID"
            ],
            default: "IN_PERSON"
        },


        // =================================================
        // TRAINER / PROVIDER
        // =================================================

        trainer: {
            type: String,
            trim: true
        },

        provider: {
            type: String,
            trim: true
        },


        // =================================================
        // SCHEDULE
        // =================================================

        startDate: {
            type: Date,
            required: true
        },

        endDate: {
            type: Date,
            required: true
        },

        startTime: {
            type: String,
            trim: true
        },

        endTime: {
            type: String,
            trim: true
        },


        // =================================================
        // TRAINING DETAILS
        // =================================================

        description: {
            type: String,
            trim: true
        },

        objectives: {
            type: String,
            trim: true
        },

        location: {
            type: String,
            trim: true
        },

        capacity: {
            type: Number,
            min: 1,
            default: null
        },


        // =================================================
        // EMPLOYEES
        // =================================================

        enrolledEmployees: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Employee"
            }
        ],


        // =================================================
        // STATUS
        // =================================================

        status: {
            type: String,
            enum: [
                "DRAFT",
                "ACTIVE",
                "COMPLETED",
                "CANCELLED"
            ],
            default: "DRAFT",
            index: true
        },


        // =================================================
        // COMPLETION
        // =================================================

        completionDate: {
            type: Date
        },


        // =================================================
        // CERTIFICATE
        // =================================================

        certificateAvailable: {
            type: Boolean,
            default: false
        },

        certificateTemplate: {
            type: String,
            trim: true
        },


        // =================================================
        // CREATED BY
        // =================================================

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },


        // =================================================
        // UPDATED BY
        // =================================================

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }

    },

    {
        timestamps: true
    }
);


// =====================================================
// INDEXES
// =====================================================

// Training ID unique inside organization

trainingSchema.index(
    {
        organization: 1,
        trainingId: 1
    },
    {
        unique: true
    }
);


// Training listing

trainingSchema.index({
    organization: 1,
    status: 1,
    startDate: -1
});


// Category filtering

trainingSchema.index({
    organization: 1,
    category: 1
});


// Date filtering

trainingSchema.index({
    organization: 1,
    startDate: 1,
    endDate: 1
});


// =====================================================
// EXPORT
// =====================================================

module.exports =
    mongoose.model(
        "Training",
        trainingSchema
    );