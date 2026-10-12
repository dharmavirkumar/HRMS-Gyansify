const mongoose = require("mongoose");

const designationSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true
        },

        level: {
            type: String,
            enum: [
                "Intern",
                "Junior",
                "Mid Level",
                "Senior",
                "Lead",
                "Manager",
                "Director"
            ],
            default: "Junior"
        },

        description: {
            type: String,
            trim: true
        },

        status: {
            type: String,
            enum: ["Active", "Inactive"],
            default: "Active"
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model(
    "Designation",
    designationSchema
);