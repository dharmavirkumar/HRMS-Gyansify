
const mongoose = require("mongoose");


// =====================================================
// ORGANIZATION SCHEMA
// =====================================================

const organizationSchema =
    new mongoose.Schema(
        {

            // =================================================
            // BASIC INFORMATION
            // =================================================

            name: {

                type: String,

                required: true,

                trim: true

            },


            legalName: {

                type: String,

                trim: true

            },


            email: {

                type: String,

                trim: true,

                lowercase: true

            },


            phone: {

                type: String,

                trim: true

            },


            // =================================================
            // COMPANY BRANDING
            // =================================================

            logo: {

                type: String,

                trim: true,

                default: ""

            },


            website: {

                type: String,

                trim: true,

                default: ""

            },


            // =================================================
            // ADDRESS
            // =================================================

            address: {

                type: String,

                trim: true,

                default: ""

            },


            city: {

                type: String,

                trim: true,

                default: ""

            },


            state: {

                type: String,

                trim: true,

                default: ""

            },


            country: {

                type: String,

                trim: true,

                default: "India"

            },


            pincode: {

                type: String,

                trim: true,

                default: ""

            },


            // =================================================
            // HRMS SETTINGS
            // =================================================

            timezone: {

                type: String,

                default: "Asia/Kolkata"

            },


            currency: {

                type: String,

                default: "INR"

            },


            // =================================================
            // FINANCIAL YEAR
            // =================================================

            financialYearStartMonth: {

                type: Number,

                min: 1,

                max: 12,

                default: 4

            },


            // =================================================
            // WORKING DAYS
            // =================================================

            workingDays: {

                type: [

                    String

                ],

                default: [

                    "Monday",

                    "Tuesday",

                    "Wednesday",

                    "Thursday",

                    "Friday"

                ]

            },


            // =================================================
            // ATTENDANCE SETTINGS
            // =================================================

            attendanceStartTime: {

                type: String,

                default: "10:00"

            },


            attendanceLateAfter: {

                type: String,

                default: "10:15"

            },


            attendanceEndTime: {

                type: String,

                default: "18:00"

            },


            minimumWorkingHours: {

                type: Number,

                default: 8

            },


            // =================================================
            // LEAVE SETTINGS
            // =================================================

            leaveApprovalRequired: {

                type: Boolean,

                default: true

            },


            // =================================================
            // STATUS
            // =================================================

            status: {

                type: String,

                enum: [

                    "ACTIVE",

                    "SUSPENDED",

                    "INACTIVE"

                ],

                default: "ACTIVE"

            }

        },

        {

            timestamps: true

        }

    );


// =====================================================
// INDEXES
// =====================================================

organizationSchema.index(
    {
        name: 1
    }
);


organizationSchema.index(
    {
        email: 1
    }
);


// =====================================================
// EXPORT MODEL
// =====================================================

module.exports =
    mongoose.model(
        "Organization",
        organizationSchema
    );
