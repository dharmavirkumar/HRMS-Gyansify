// =====================================================
// GYANSIFY HRMS
// PAYROLL MODEL
// =====================================================

const mongoose = require("mongoose");


// =====================================================
// PAYROLL SCHEMA
// =====================================================

const payrollSchema = new mongoose.Schema(
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
        // PAYROLL MONTH
        // =================================================

        payrollMonth: {

            type: Number,

            required: true,

            min: 1,

            max: 12

        },


        // =================================================
        // PAYROLL YEAR
        // =================================================

        payrollYear: {

            type: Number,

            required: true,

            min: 2000,

            max: 2100

        },


        // =================================================
        // PAYROLL PERIOD
        // =================================================

        periodStart: {

            type: Date,

            required: true

        },


        periodEnd: {

            type: Date,

            required: true

        },


        // =================================================
        // PAYROLL NUMBER
        // =================================================

        payrollNumber: {

            type: String,

            trim: true,

            maxlength: 100

        },


        // =================================================
        // TOTAL EMPLOYEES
        // =================================================

        totalEmployees: {

            type: Number,

            default: 0,

            min: 0

        },


        // =================================================
        // PROCESSED EMPLOYEES
        // =================================================

        processedEmployees: {

            type: Number,

            default: 0,

            min: 0

        },


        // =================================================
        // TOTAL GROSS SALARY
        // =================================================

        totalGrossSalary: {

            type: Number,

            default: 0,

            min: 0

        },


        // =================================================
        // TOTAL DEDUCTIONS
        // =================================================

        totalDeductions: {

            type: Number,

            default: 0,

            min: 0

        },


        // =================================================
        // TOTAL NET SALARY
        // =================================================

        totalNetSalary: {

            type: Number,

            default: 0,

            min: 0

        },


        // =================================================
        // TOTAL TAX
        // =================================================

        totalTDS: {

            type: Number,

            default: 0,

            min: 0

        },


        // =================================================
        // TOTAL PF
        // =================================================

        totalPF: {

            type: Number,

            default: 0,

            min: 0

        },


        // =================================================
        // TOTAL ESI
        // =================================================

        totalESI: {

            type: Number,

            default: 0,

            min: 0

        },


        // =================================================
        // TOTAL PROFESSIONAL TAX
        // =================================================

        totalProfessionalTax: {

            type: Number,

            default: 0,

            min: 0

        },


        // =================================================
        // TOTAL BONUS
        // =================================================

        totalBonus: {

            type: Number,

            default: 0,

            min: 0

        },


        // =================================================
        // TOTAL OVERTIME
        // =================================================

        totalOvertime: {

            type: Number,

            default: 0,

            min: 0

        },


        // =================================================
        // PAYROLL STATUS
        // =================================================

        status: {

            type: String,

            enum: [

                "DRAFT",

                "PROCESSING",

                "PROCESSED",

                "APPROVED",

                "PAID",

                "FAILED",

                "CANCELLED"

            ],

            default: "DRAFT",

            index: true

        },


        // =================================================
        // PAYMENT DATE
        // =================================================

        paymentDate: {

            type: Date,

            default: null

        },


        // =================================================
        // PAYMENT MODE
        // =================================================

        paymentMode: {

            type: String,

            enum: [

                "BANK_TRANSFER",

                "CASH",

                "CHEQUE",

                "OTHER",

                null

            ],

            default: null

        },


        // =================================================
        // NOTES
        // =================================================

        notes: {

            type: String,

            trim: true,

            maxlength: 2000,

            default: ""

        },


        // =================================================
        // PROCESSING INFORMATION
        // =================================================

        processedAt: {

            type: Date,

            default: null

        },


        processedBy: {

            type: mongoose.Schema.Types.ObjectId,

            ref: "User",

            default: null

        },


        // =================================================
        // APPROVAL INFORMATION
        // =================================================

        approvedAt: {

            type: Date,

            default: null

        },


        approvedBy: {

            type: mongoose.Schema.Types.ObjectId,

            ref: "User",

            default: null

        },


        // =================================================
        // CANCELLATION INFORMATION
        // =================================================

        cancelledAt: {

            type: Date,

            default: null

        },


        cancelledBy: {

            type: mongoose.Schema.Types.ObjectId,

            ref: "User",

            default: null

        },


        cancellationReason: {

            type: String,

            trim: true,

            maxlength: 1000,

            default: ""

        }

    },

    {

        timestamps: true

    }

);


// =====================================================
// UNIQUE MONTHLY PAYROLL
// ONE PAYROLL RUN PER ORGANIZATION / MONTH / YEAR
// =====================================================

payrollSchema.index(
    {
        organizationId: 1,
        payrollMonth: 1,
        payrollYear: 1
    },
    {
        unique: true
    }
);


// =====================================================
// PAYROLL NUMBER
// =====================================================

payrollSchema.index(
    {
        organizationId: 1,
        payrollNumber: 1
    },
    {
        unique: true,
        sparse: true
    }
);


// =====================================================
// STATUS INDEX
// =====================================================

payrollSchema.index(
    {
        organizationId: 1,
        status: 1
    }
);


// =====================================================
// DATE INDEX
// =====================================================

payrollSchema.index(
    {
        organizationId: 1,
        periodStart: -1
    }
);


// =====================================================
// VALIDATE PAYROLL PERIOD
// =====================================================

payrollSchema.pre(
    "validate",
    function (next) {

        if (
            this.periodStart &&
            this.periodEnd &&
            this.periodStart > this.periodEnd
        ) {

            return next(
                new Error(
                    "Payroll period start date cannot be after end date."
                )
            );

        }


        next();

    }
);


// =====================================================
// CALCULATE PAYROLL TOTALS
// =====================================================

payrollSchema.pre(
    "validate",
    function (next) {

        this.totalNetSalary =
            Math.max(
                0,
                Number(this.totalGrossSalary || 0) -
                Number(this.totalDeductions || 0)
            );


        next();

    }
);


// =====================================================
// EXPORT MODEL
// =====================================================

module.exports =
    mongoose.model(
        "Payroll",
        payrollSchema
    );