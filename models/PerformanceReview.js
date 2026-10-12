const mongoose = require("mongoose");

const performanceReviewSchema = new mongoose.Schema(
    {
        // =====================================================
        // ORGANIZATION
        // =====================================================

        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true
        },

        // =====================================================
        // EMPLOYEE
        // =====================================================

        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true
        },

        // =====================================================
        // REVIEWER
        // =====================================================

        reviewer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        // =====================================================
        // REVIEW PERIOD
        // =====================================================

        reviewCycle: {
            type: String,
            required: true,
            trim: true
        },

        reviewPeriodStart: {
            type: Date,
            required: true
        },

        reviewPeriodEnd: {
            type: Date,
            required: true
        },

        // =====================================================
        // REVIEW STATUS
        // =====================================================

        status: {
            type: String,
            enum: [
                "DRAFT",
                "PENDING",
                "SUBMITTED",
                "COMPLETED",
                "ACKNOWLEDGED",
                "CANCELLED"
            ],
            default: "DRAFT",
            index: true
        },

        // =====================================================
        // OVERALL RATING
        // =====================================================

        overallRating: {
            type: Number,
            min: 0,
            max: 5,
            default: 0
        },

        ratingLabel: {
            type: String,
            enum: [
                "OUTSTANDING",
                "EXCEEDS_EXPECTATIONS",
                "MEETS_EXPECTATIONS",
                "NEEDS_IMPROVEMENT",
                "UNSATISFACTORY"
            ],
            default: null
        },

        // =====================================================
        // PERFORMANCE CATEGORIES
        // =====================================================

        ratings: {
            qualityOfWork: {
                type: Number,
                min: 0,
                max: 5,
                default: 0
            },

            productivity: {
                type: Number,
                min: 0,
                max: 5,
                default: 0
            },

            communication: {
                type: Number,
                min: 0,
                max: 5,
                default: 0
            },

            teamwork: {
                type: Number,
                min: 0,
                max: 5,
                default: 0
            },

            leadership: {
                type: Number,
                min: 0,
                max: 5,
                default: 0
            },

            problemSolving: {
                type: Number,
                min: 0,
                max: 5,
                default: 0
            },

            attendance: {
                type: Number,
                min: 0,
                max: 5,
                default: 0
            },

            initiative: {
                type: Number,
                min: 0,
                max: 5,
                default: 0
            }
        },

        // =====================================================
        // GOALS
        // =====================================================

        goals: [
            {
                title: {
                    type: String,
                    required: true,
                    trim: true
                },

                description: {
                    type: String,
                    trim: true
                },

                target: {
                    type: String,
                    trim: true
                },

                achievement: {
                    type: String,
                    trim: true
                },

                completionPercentage: {
                    type: Number,
                    min: 0,
                    max: 100,
                    default: 0
                },

                rating: {
                    type: Number,
                    min: 0,
                    max: 5,
                    default: 0
                },

                status: {
                    type: String,
                    enum: [
                        "NOT_STARTED",
                        "IN_PROGRESS",
                        "COMPLETED",
                        "CANCELLED"
                    ],
                    default: "NOT_STARTED"
                }
            }
        ],

        // =====================================================
        // STRENGTHS
        // =====================================================

        strengths: [
            {
                type: String,
                trim: true
            }
        ],

        // =====================================================
        // AREAS OF IMPROVEMENT
        // =====================================================

        areasOfImprovement: [
            {
                type: String,
                trim: true
            }
        ],

        // =====================================================
        // FEEDBACK
        // =====================================================

        achievements: {
            type: String,
            trim: true
        },

        managerComments: {
            type: String,
            trim: true
        },

        employeeComments: {
            type: String,
            trim: true
        },

        // =====================================================
        // DEVELOPMENT PLAN
        // =====================================================

        developmentPlan: {
            type: String,
            trim: true
        },

        trainingRecommendations: [
            {
                type: String,
                trim: true
            }
        ],

        // =====================================================
        // PROMOTION / COMPENSATION
        // =====================================================

        promotionRecommended: {
            type: Boolean,
            default: false
        },

        salaryRevisionRecommended: {
            type: Boolean,
            default: false
        },

        recommendedSalaryRevision: {
            type: Number,
            min: 0,
            default: 0
        },

        // =====================================================
        // REVIEW DATES
        // =====================================================

        submittedAt: {
            type: Date
        },

        completedAt: {
            type: Date
        },

        acknowledgedAt: {
            type: Date
        },

        // =====================================================
        // EMPLOYEE ACKNOWLEDGEMENT
        // =====================================================

        employeeAcknowledged: {
            type: Boolean,
            default: false
        },

        employeeAcknowledgementComment: {
            type: String,
            trim: true
        },

        // =====================================================
        // AUDIT
        // =====================================================

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

performanceReviewSchema.index({
    organizationId: 1,
    employee: 1,
    reviewPeriodStart: -1
});

performanceReviewSchema.index({
    organizationId: 1,
    status: 1
});

performanceReviewSchema.index({
    organizationId: 1,
    reviewer: 1,
    status: 1
});


// =====================================================
// CALCULATE OVERALL RATING
// =====================================================

performanceReviewSchema.pre("validate", function (next) {

    const ratings = this.ratings || {};

    const values = [
        Number(ratings.qualityOfWork || 0),
        Number(ratings.productivity || 0),
        Number(ratings.communication || 0),
        Number(ratings.teamwork || 0),
        Number(ratings.leadership || 0),
        Number(ratings.problemSolving || 0),
        Number(ratings.attendance || 0),
        Number(ratings.initiative || 0)
    ];

    const validRatings = values.filter(
        value => value > 0
    );

    if (validRatings.length > 0) {

        const total = validRatings.reduce(
            (sum, value) => sum + value,
            0
        );

        this.overallRating = Number(
            (total / validRatings.length).toFixed(2)
        );
    }

    // =====================================================
    // RATING LABEL
    // =====================================================

    if (this.overallRating >= 4.5) {

        this.ratingLabel = "OUTSTANDING";

    } else if (this.overallRating >= 3.5) {

        this.ratingLabel = "EXCEEDS_EXPECTATIONS";

    } else if (this.overallRating >= 2.5) {

        this.ratingLabel = "MEETS_EXPECTATIONS";

    } else if (this.overallRating >= 1.5) {

        this.ratingLabel = "NEEDS_IMPROVEMENT";

    } else {

        this.ratingLabel = "UNSATISFACTORY";
    }

    next();
});


module.exports = mongoose.model(
    "PerformanceReview",
    performanceReviewSchema
);