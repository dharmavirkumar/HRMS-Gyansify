
const mongoose = require("mongoose");


// =====================================================
// LEAVE BALANCE SCHEMA
// =====================================================

const leaveBalanceSchema =
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
            // EMPLOYEE
            // =================================================

            employee: {

                type:
                    mongoose.Schema.Types.ObjectId,

                ref:
                    "Employee",

                required:
                    true

            },


            // =================================================
            // LEAVE TYPE
            // =================================================

            leaveType: {

                type:
                    mongoose.Schema.Types.ObjectId,

                ref:
                    "LeaveType",

                required:
                    true

            },


            // =================================================
            // YEAR
            // =================================================

            year: {

                type:
                    Number,

                required:
                    true

            },


            // =================================================
            // ALLOCATED
            // =================================================

            allocated: {

                type:
                    Number,

                default:
                    0,

                min:
                    0

            },


            // =================================================
            // CARRIED FORWARD
            // =================================================

            carriedForward: {

                type:
                    Number,

                default:
                    0,

                min:
                    0

            },


            // =================================================
            // USED
            // =================================================

            used: {

                type:
                    Number,

                default:
                    0,

                min:
                    0

            },


            // =================================================
            // ADJUSTMENT
            // =================================================

            adjustment: {

                type:
                    Number,

                default:
                    0

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
// AVAILABLE LEAVE
// =====================================================

leaveBalanceSchema.virtual(
    "available"
).get(function () {

    return Math.max(
        0,

        (
            this.allocated || 0
        ) +

        (
            this.carriedForward || 0
        ) +

        (
            this.adjustment || 0
        ) -

        (
            this.used || 0
        )
    );

});


// =====================================================
// JSON VIRTUALS
// =====================================================

leaveBalanceSchema.set(
    "toJSON",
    {
        virtuals: true
    }
);


// =====================================================
// UNIQUE BALANCE
// =====================================================
//
// One employee can have only one balance
// for one leave type in one year.
//

leaveBalanceSchema.index(
    {
        organization: 1,

        employee: 1,

        leaveType: 1,

        year: 1

    },
    {
        unique: true
    }
);


// =====================================================
// EXPORT
// =====================================================

module.exports =
    mongoose.model(
        "LeaveBalance",
        leaveBalanceSchema
    );