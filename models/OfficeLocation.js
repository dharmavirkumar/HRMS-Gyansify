"use strict";

const mongoose = require("mongoose");

const officeLocationSchema = new mongoose.Schema(
    {
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            unique: true,
            index: true
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

        radiusMeters: {
            type: Number,
            required: true,
            default: 100,
            min: 10,
            max: 5000
        },

        isActive: {
            type: Boolean,
            default: true
        },

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model(
    "OfficeLocation",
    officeLocationSchema
);