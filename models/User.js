
const mongoose = require("mongoose");

// =====================================================
// USER SCHEMA
// =====================================================

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        // Always store a bcrypt hash, never plain-text passwords.
        password: {
            type: String,
            required: true,
            select: false
        },

        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true
        },

        // Connect the login account to its employee record.
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null
        },

        role: {
            type: String,
            enum: [
                "SUPER_ADMIN",
                "HR_ADMIN",
                "HR_EXECUTIVE",
                "MANAGER",
                "EMPLOYEE"
            ],
            default: "EMPLOYEE"
        },

        status: {
            type: String,
            enum: [
                "ACTIVE",
                "INACTIVE",
                "SUSPENDED"
            ],
            default: "INACTIVE"
        },

        // Invitation setup fields
        invitationTokenHash: {
            type: String,
            select: false,
            default: undefined
        },

        invitationExpiresAt: {
            type: Date,
            default: undefined
        }
    },
    {
        timestamps: true
    }
);

// Keep email globally unique, matching your existing schema.
userSchema.index({
    organization: 1,
    email: 1
});

// At most one login account per employee.
userSchema.index(
    { employee: 1 },
    {
        unique: true,
        partialFilterExpression: {
            employee: { $type: "objectId" }
        }
    }
);

module.exports = mongoose.model("User", userSchema);