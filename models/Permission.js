const mongoose = require("mongoose");


// =====================================================
// PERFORMANCE REVIEW SCHEMA
// =====================================================

const performanceSchema = new mongoose.Schema(
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
        // PERFORMANCE REVIEW ID
        // =================================================

        reviewId: {
            type: String,
            required: true,
            trim: true
        },


        // =================================================
        // EMPLOYEE
        // =================================================

        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true
        },


        // =================================================
        // REVIEWER
        // =================================================

        reviewer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },

        reviewerName: {
            type: String,
            trim: true
        },


        // =================================================
        // REVIEW TYPE
        // =================================================

        reviewType: {
            type: String,
            enum: [
                "ANNUAL",
                "HALF_YEARLY",
                "QUARTERLY",
                "PROBATION",
                "PROJECT",
                "OTHER"
            ],
            required: true,
            default: "ANNUAL"
        },


        // =================================================
        // REVIEW PERIOD
        // =================================================

        periodStart: {
            type: Date,
            required: true
        },

        periodEnd: {
            type: Date,
            required: true
        },

        reviewDate: {
            type: Date
        },


        // =================================================
        // GOALS & OBJECTIVES
        // =================================================

        goals: {
            type: String,
            trim: true
        },

        achievements: {
            type: String,
            trim: true
        },


        // =================================================
        // PERFORMANCE ASSESSMENT
        // =================================================

        rating: {
            type: Number,
            min: 1,
            max: 5
        },

        strengths: {
            type: String,
            trim: true
        },

        improvements: {
            type: String,
            trim: true
        },

        feedback: {
            type: String,
            trim: true
        },


        // =================================================
        // DEVELOPMENT PLAN
        // =================================================

        developmentPlan: {
            type: String,
            trim: true
        },

        nextGoals: {
            type: String,
            trim: true
        },


        // =================================================
        // REVIEW STATUS
        // =================================================

        status: {
            type: String,
            enum: [
                "DRAFT",
                "PENDING",
                "IN_PROGRESS",
                "COMPLETED",
                "CANCELLED"
            ],
            default: "DRAFT",
            index: true
        },


        // =================================================
        // EMPLOYEE ACKNOWLEDGEMENT
        // =================================================

        employeeAcknowledged: {
            type: Boolean,
            default: false
        },

        acknowledgedAt: {
            type: Date
        },


        // =================================================
        // EMPLOYEE COMMENTS
        // =================================================

        employeeComments: {
            type: String,
            trim: true
        },


        // =================================================
        // FINAL SCORE
        // =================================================

        finalScore: {
            type: Number,
            min: 0,
            max: 5
        },

        performanceLevel: {
            type: String,
            enum: [
                "OUTSTANDING",
                "EXCEEDS_EXPECTATIONS",
                "MEETS_EXPECTATIONS",
                "NEEDS_IMPROVEMENT",
                "UNSATISFACTORY"
            ]
        },


        // =================================================
        // NEXT REVIEW
        // =================================================

        nextReviewDate: {
            type: Date
        },


        // =================================================
        // CREATED / UPDATED BY
        // =================================================

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },

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


// Unique review ID per organization

performanceSchema.index(
    {
        organization: 1,
        reviewId: 1
    },
    {
        unique: true
    }
);


// Employee performance history

performanceSchema.index({
    organization: 1,
    employee: 1,
    periodStart: -1
});


// Performance status

performanceSchema.index({
    organization: 1,
    status: 1
});


// Review type

performanceSchema.index({
    organization: 1,
    reviewType: 1
});


// Review dates

performanceSchema.index({
    organization: 1,
    periodStart: 1,
    periodEnd: 1
});


// =====================================================
// VALIDATION
// =====================================================


// Review period validation

performanceSchema.pre(
    "validate",
    function (next) {

        if (
            this.periodStart &&
            this.periodEnd &&
            this.periodEnd < this.periodStart
        ) {

            return next(
                new Error(
                    "Review period end date cannot be before start date."
                )
            );

        }

        next();

    }
);


// =====================================================
// AUTOMATIC PERFORMANCE LEVEL
// =====================================================

performanceSchema.pre(
    "save",
    function (next) {

        const score =
            this.finalScore || this.rating;

        if (!score) {
            return next();
        }


        if (score >= 4.5) {

            this.performanceLevel =
                "OUTSTANDING";

        } else if (score >= 4) {

            this.performanceLevel =
                "EXCEEDS_EXPECTATIONS";

        } else if (score >= 3) {

            this.performanceLevel =
                "MEETS_EXPECTATIONS";

        } else if (score >= 2) {

            this.performanceLevel =
                "NEEDS_IMPROVEMENT";

        } else {

            this.performanceLevel =
                "UNSATISFACTORY";

        }

        next();

    }
);


// =====================================================
// EXPORT
// =====================================================

module.exports =
    mongoose.model(
        "Performance",
        performanceSchema
    );