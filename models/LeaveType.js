
const mongoose = require("mongoose");


const leaveTypeSchema =
    new mongoose.Schema(
        {

            // =================================================
            // ORGANIZATION
            // =================================================

            organization: {

                type:
                    mongoose.Schema.Types.ObjectId,

                ref:
                    "Organization",

                required:
                    true

            },


            // =================================================
            // BASIC INFORMATION
            // =================================================

            name: {

                type:
                    String,

                required:
                    true,

                trim:
                    true

            },


            code: {

                type:
                    String,

                required:
                    true,

                uppercase:
                    true,

                trim:
                    true

            },


            description: {

                type:
                    String,

                trim:
                    true

            },


            // =================================================
            // PAID / UNPAID
            // =================================================

            isPaid: {

                type:
                    Boolean,

                default:
                    true

            },


            // =================================================
            // YEARLY ALLOCATION
            // =================================================

            annualLimit: {

                type:
                    Number,

                default:
                    0,

                min:
                    0

            },


            // =================================================
            // CARRY FORWARD
            // =================================================

            allowCarryForward: {

                type:
                    Boolean,

                default:
                    false

            },


            maxCarryForward: {

                type:
                    Number,

                default:
                    0,

                min:
                    0

            },


            // =================================================
            // HALF DAY
            // =================================================

            allowHalfDay: {

                type:
                    Boolean,

                default:
                    true

            },


            // =================================================
            // DOCUMENT
            // =================================================

            requireDocument: {

                type:
                    Boolean,

                default:
                    false

            },


            // =================================================
            // STATUS
            // =================================================

            status: {

                type:
                    String,

                enum: [
                    "Active",
                    "Inactive"
                ],

                default:
                    "Active"

            }

        },

        {

            timestamps:
                true

        }
    );


// =====================================================
// UNIQUE CODE PER ORGANIZATION
// =====================================================

leaveTypeSchema.index(
    {
        organization: 1,
        code: 1
    },
    {
        unique: true
    }
);


module.exports =
    mongoose.model(
        "LeaveType",
        leaveTypeSchema
    );
