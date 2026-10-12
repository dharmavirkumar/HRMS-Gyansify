
const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
    {
        // ==========================================
        // ORGANIZATION
        // ==========================================
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: [true, "Organization is required"],
            index: true
        },

        // ==========================================
        // EMPLOYEE IDENTIFICATION
        // ==========================================
        employeeId: {
            type: String,
            required: [true, "Employee ID is required"],
            trim: true,
            uppercase: true,
            maxlength: [50, "Employee ID cannot exceed 50 characters"]
        },

        // ==========================================
        // PERSONAL INFORMATION
        // ==========================================
        firstName: {
            type: String,
            required: [true, "First name is required"],
            trim: true,
            maxlength: [100, "First name cannot exceed 100 characters"]
        },

        lastName: {
            type: String,
            trim: true,
            default: "",
            maxlength: [100, "Last name cannot exceed 100 characters"]
        },

        email: {
            type: String,
            required: [true, "Email is required"],
            lowercase: true,
            trim: true,
            maxlength: [254, "Email cannot exceed 254 characters"],
            match: [
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                "Please enter a valid email address"
            ]
        },

        phone: {
            type: String,
            trim: true,
            default: "",
            maxlength: [25, "Phone number cannot exceed 25 characters"]
        },

        gender: {
            type: String,
            enum: {
                values: ["Male", "Female", "Other", ""],
                message: "Invalid gender"
            },
            default: ""
        },

        dateOfBirth: {
            type: Date,
            validate: {
                validator: function (value) {
                    return !value || value <= new Date();
                },
                message: "Date of birth cannot be in the future"
            }
        },

        // ==========================================
        // ORGANIZATION REFERENCES
        // ==========================================
        department: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
            default: null
        },

        designation: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Designation",
            default: null
        },

        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            default: null
        },

        location: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Location",
            default: null
        },

        // ==========================================
        // EMPLOYMENT INFORMATION
        // ==========================================
        joiningDate: {
            type: Date,
            validate: {
                validator: function (value) {
                    return !value || !Number.isNaN(value.getTime());
                },
                message: "Invalid joining date"
            }
        },

        employmentType: {
            type: String,
            enum: {
                values: [
                    "Permanent",
                    "Probation",
                    "Contract",
                    "Intern",
                    "Part Time"
                ],
                message: "Invalid employment type"
            },
            default: "Permanent"
        },

        reportingManager: {
            type: String,
            trim: true,
            default: "",
            maxlength: [150, "Reporting manager cannot exceed 150 characters"]
        },

        status: {
            type: String,
            enum: {
                values: [
                    "Active",
                    "On Leave",
                    "Notice Period",
                    "Suspended",
                    "Exited"
                ],
                message: "Invalid employee status"
            },
            default: "Active",
            index: true
        },

        // ==========================================
        // CONTACT INFORMATION
        // ==========================================
        address: {
            type: String,
            trim: true,
            default: "",
            maxlength: [1000, "Address cannot exceed 1000 characters"]
        }
    },
    {
        timestamps: true,
        versionKey: "__v",
        strict: true
    }
);

// ==========================================
// DATABASE INDEXES
// ==========================================

// Employee ID unique within an organization
employeeSchema.index(
    { organization: 1, employeeId: 1 },
    { unique: true }
);

// Email unique within an organization
employeeSchema.index(
    { organization: 1, email: 1 },
    { unique: true }
);

// Useful for organization employee lists and status filters
employeeSchema.index({
    organization: 1,
    status: 1,
    firstName: 1
});

// Useful for department-wise employee listings
employeeSchema.index({
    organization: 1,
    department: 1,
    status: 1
});

// ==========================================
// INSTANCE HELPERS
// ==========================================

employeeSchema.virtual("fullName").get(function () {
    return [this.firstName, this.lastName]
        .filter(Boolean)
        .join(" ");
});

// Include virtuals when converting documents to JSON
employeeSchema.set("toJSON", {
    virtuals: true
});

employeeSchema.set("toObject", {
    virtuals: true
});

// ==========================================
// MODEL EXPORT
// ==========================================

module.exports =
    mongoose.models.Employee ||
    mongoose.model("Employee", employeeSchema);
