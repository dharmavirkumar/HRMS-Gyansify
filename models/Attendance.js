const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true
        },

        date: {
            type: String,
            required: true
        },

        checkIn: {
            type: Date,
            default: null
        },

        checkOut: {
            type: Date,
            default: null
        },

        status: {
            type: String,

            enum: [
                "Present",
                "Absent",
                "Late",
                "Half Day",
                "Leave",
                "Holiday"
            ],

            default: "Present"
        },

        workMinutes: {
            type: Number,
            default: 0
        },

        overtimeMinutes: {
            type: Number,
            default: 0
        },

        remarks: {
            type: String,
            trim: true
        }
    },
    {
        timestamps: true
    }
);


// =====================================================
// ONE ATTENDANCE PER EMPLOYEE PER DAY
// =====================================================

attendanceSchema.index(
    {
        employee: 1,
        date: 1
    },
    {
        unique: true
    }
);


module.exports = mongoose.model(
    "Attendance",
    attendanceSchema
);