
const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        code: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },

        description: {
            type: String,
            trim: true,
            default: ""
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

departmentSchema.index(
    { organizationId: 1, name: 1 },
    { unique: true }
);

departmentSchema.index(
    { organizationId: 1, code: 1 },
    { unique: true }
);

module.exports = mongoose.model(
    "Department",
    departmentSchema
);
