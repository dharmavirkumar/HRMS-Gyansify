
const mongoose = require("mongoose");

const designationSchema = new mongoose.Schema(
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

// Same designation name/code can exist in different organizations.
designationSchema.index(
    { organizationId: 1, name: 1 },
    { unique: true }
);

designationSchema.index(
    { organizationId: 1, code: 1 },
    { unique: true }
);

module.exports = mongoose.model(
    "Designation",
    designationSchema
);
