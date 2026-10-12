const mongoose = require("mongoose");

const employeeDocumentSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true
        },

        documentType: {
            type: String,
            enum: [
                "Resume",
                "Aadhaar",
                "PAN",
                "Joining Letter",
                "Experience Letter",
                "Offer Letter",
                "Education Certificate",
                "Other"
            ],
            required: true
        },

        documentName: {
            type: String,
            required: true,
            trim: true
        },

        fileName: {
            type: String,
            required: true
        },

        filePath: {
            type: String,
            required: true
        },

        mimeType: {
            type: String
        },

        fileSize: {
            type: Number
        },

        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee"
        },

        status: {
            type: String,
            enum: [
                "Active",
                "Archived"
            ],
            default: "Active"
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model(
    "EmployeeDocument",
    employeeDocumentSchema
);