
const mongoose =
    require("mongoose");


// =====================================================
// LEAVE REQUEST SCHEMA
// =====================================================

const leaveRequestSchema =
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
            // FROM DATE
            // =================================================

            fromDate: {

                type:
                    Date,

                required:
                    true

            },


            // =================================================
            // TO DATE
            // =================================================

            toDate: {

                type:
                    Date,

                required:
                    true

            },


            // =================================================
            // TOTAL DAYS
            // =================================================

            totalDays: {

                type:
                    Number,

                required:
                    true,

                min:
                    0.5

            },


            // =================================================
            // REASON
            // =================================================

            reason: {

                type:
                    String,

                required:
                    true,

                trim:
                    true

            },


            // =================================================
            // STATUS
            // =================================================

            status: {

                type:
                    String,

                enum: [

                    "Pending",

                    "Approved",

                    "Rejected",

                    "Cancelled"

                ],

                default:
                    "Pending"

            },


            // =================================================
            // REVIEWED BY
            // =================================================

            reviewedBy: {

                type:
                    mongoose.Schema.Types.ObjectId,

                ref:
                    "User",

                default:
                    null

            },


            // =================================================
            // REVIEWED AT
            // =================================================

            reviewedAt: {

                type:
                    Date,

                default:
                    null

            },


            // =================================================
            // HR REMARK
            // =================================================

            reviewRemark: {

                type:
                    String,

                trim:
                    true,

                default:
                    ""

            }

        },

        {

            timestamps:
                true

        }

    );


// =====================================================
// INDEXES
// =====================================================

leaveRequestSchema.index({

    organization:
        1,

    employee:
        1,

    status:
        1

});


leaveRequestSchema.index({

    fromDate:
        1,

    toDate:
        1

});


// =====================================================
// EXPORT
// =====================================================

module.exports =
    mongoose.model(
        "LeaveRequest",
        leaveRequestSchema
    );

