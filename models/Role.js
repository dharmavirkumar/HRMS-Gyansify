// =====================================================
// GYANSIFY HRMS
// ROLE MODEL
// =====================================================

const mongoose = require("mongoose");


// =====================================================
// ROLE SCHEMA
// =====================================================

const roleSchema = new mongoose.Schema(
    {

        // =================================================
        // ORGANIZATION
        // =================================================

        organizationId: {

            type: mongoose.Schema.Types.ObjectId,

            ref: "Organization",

            required: true,

            index: true

        },


        // =================================================
        // ROLE NAME
        // =================================================

        name: {

            type: String,

            required: true,

            trim: true,

            maxlength: 100

        },


        // =================================================
        // ROLE CODE
        // =================================================

        code: {

            type: String,

            required: true,

            trim: true,

            uppercase: true,

            maxlength: 50

        },


        // =================================================
        // DESCRIPTION
        // =================================================

        description: {

            type: String,

            trim: true,

            maxlength: 500,

            default: ""

        },


        // =================================================
        // PERMISSIONS
        // =================================================

        permissions: [

            {

                type: mongoose.Schema.Types.ObjectId,

                ref: "Permission"

            }

        ],


        // =================================================
        // SYSTEM ROLE
        // =================================================

        isSystemRole: {

            type: Boolean,

            default: false,

            index: true

        },


        // =================================================
        // STATUS
        // =================================================

        status: {

            type: String,

            enum: [

                "ACTIVE",

                "INACTIVE"

            ],

            default: "ACTIVE",

            index: true

        },


        // =================================================
        // CREATED BY
        // =================================================

        createdBy: {

            type: mongoose.Schema.Types.ObjectId,

            ref: "User",

            default: null

        },


        // =================================================
        // UPDATED BY
        // =================================================

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


// =====================================================
// UNIQUE ROLE PER ORGANIZATION
// =====================================================

roleSchema.index(
    {
        organizationId: 1,
        code: 1
    },
    {
        unique: true
    }
);


// =====================================================
// ORGANIZATION + STATUS
// =====================================================

roleSchema.index(
    {
        organizationId: 1,
        status: 1
    }
);


// =====================================================
// ORGANIZATION + SYSTEM ROLE
// =====================================================

roleSchema.index(
    {
        organizationId: 1,
        isSystemRole: 1
    }
);


// =====================================================
// NORMALIZE ROLE CODE
// =====================================================

roleSchema.pre(
    "validate",
    function (next) {

        if (this.code) {

            this.code =
                this.code
                    .trim()
                    .toUpperCase();

        }


        if (this.name) {

            this.name =
                this.name
                    .trim();

        }


        next();

    }
);


// =====================================================
// EXPORT MODEL
// =====================================================

module.exports =
    mongoose.model(
        "Role",
        roleSchema
    );