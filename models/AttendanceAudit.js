"use strict";

const mongoose = require("mongoose");

const attendanceAuditSchema = new mongoose.Schema(
    {
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true
        },

        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true
        },

        attendance: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Attendance",
            default: null
        },

        action: {
            type: String,
            enum: ["CHECK_IN", "CHECK_OUT"],
            required: true
        },

        latitude: {
            type: Number,
            required: true,
            min: -90,
            max: 90
        },

        longitude: {
            type: Number,
            required: true,
            min: -180,
            max: 180
        },

        distanceMeters: {
            type: Number,
            required: true,
            min: 0
        },

        allowedRadiusMeters: {
            type: Number,
            required: true,
            min: 1
        },

        allowed: {
            type: Boolean,
            required: true
        },

        reason: {
            type: String,
            trim: true,
            maxlength: 300,
            default: ""
        }
    },
    { timestamps: true }
);

attendanceAuditSchema.index({
    organization: 1,
    employee: 1,
    createdAt: -1
});

module.exports = mongoose.model(
    "AttendanceAudit",
    attendanceAuditSchema
);