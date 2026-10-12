const mongoose = require("mongoose");


// =====================================================
// PAYSLIP SCHEMA
// =====================================================

const payslipSchema = new mongoose.Schema(
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
        // EMPLOYEE
        // =================================================

        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true
        },


        // =================================================
        // PAYROLL PERIOD
        // =================================================

        payrollMonth: {
            type: Number,
            required: true,
            min: 1,
            max: 12
        },

        payrollYear: {
            type: Number,
            required: true
        },


        // =================================================
        // PAYSLIP NUMBER
        // =================================================

        payslipNumber: {
            type: String,
            required: true,
            trim: true
        },


        // =================================================
        // EMPLOYEE SNAPSHOT
        // =================================================
        // Keeps employee information at the time
        // the payslip was generated.

        employeeSnapshot: {

            employeeId: {
                type: String,
                trim: true
            },

            name: {
                type: String,
                trim: true
            },

            email: {
                type: String,
                trim: true,
                lowercase: true
            },

            department: {
                type: String,
                trim: true
            },

            designation: {
                type: String,
                trim: true
            },

            joiningDate: {
                type: Date
            }

        },


        // =================================================
        // ATTENDANCE / WORKING DAYS
        // =================================================

        workingDays: {
            type: Number,
            default: 0,
            min: 0
        },

        paidDays: {
            type: Number,
            default: 0,
            min: 0
        },

        lopDays: {
            type: Number,
            default: 0,
            min: 0
        },

        absentDays: {
            type: Number,
            default: 0,
            min: 0
        },

        leaveDays: {
            type: Number,
            default: 0,
            min: 0
        },


        // =================================================
        // EARNINGS
        // =================================================

        earnings: {

            basicSalary: {
                type: Number,
                default: 0,
                min: 0
            },

            hra: {
                type: Number,
                default: 0,
                min: 0
            },

            conveyanceAllowance: {
                type: Number,
                default: 0,
                min: 0
            },

            medicalAllowance: {
                type: Number,
                default: 0,
                min: 0
            },

            specialAllowance: {
                type: Number,
                default: 0,
                min: 0
            },

            otherAllowance: {
                type: Number,
                default: 0,
                min: 0
            },

            overtime: {
                type: Number,
                default: 0,
                min: 0
            },

            bonus: {
                type: Number,
                default: 0,
                min: 0
            },

            incentive: {
                type: Number,
                default: 0,
                min: 0
            }

        },


        // =================================================
        // TOTAL EARNINGS
        // =================================================

        grossSalary: {
            type: Number,
            default: 0,
            min: 0
        },


        // =================================================
        // DEDUCTIONS
        // =================================================

        deductions: {

            providentFund: {
                type: Number,
                default: 0,
                min: 0
            },

            professionalTax: {
                type: Number,
                default: 0,
                min: 0
            },

            tds: {
                type: Number,
                default: 0,
                min: 0
            },

            esi: {
                type: Number,
                default: 0,
                min: 0
            },

            loanDeduction: {
                type: Number,
                default: 0,
                min: 0
            },

            lopDeduction: {
                type: Number,
                default: 0,
                min: 0
            },

            otherDeduction: {
                type: Number,
                default: 0,
                min: 0
            }

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
        // NET SALARY
        // =================================================

        netSalary: {
            type: Number,
            default: 0,
            min: 0
        },


        // =================================================
        // PAYMENT INFORMATION
        // =================================================

        paymentStatus: {
            type: String,
            enum: [
                "PENDING",
                "PROCESSING",
                "PAID",
                "FAILED",
                "CANCELLED"
            ],
            default: "PENDING",
            index: true
        },

        paymentDate: {
            type: Date
        },

        paymentMode: {
            type: String,
            enum: [
                "BANK_TRANSFER",
                "CASH",
                "CHEQUE",
                "OTHER"
            ]
        },

        transactionId: {
            type: String,
            trim: true
        },


        // =================================================
        // PAYSLIP STATUS
        // =================================================

        status: {
            type: String,
            enum: [
                "DRAFT",
                "GENERATED",
                "FINALIZED",
                "CANCELLED"
            ],
            default: "DRAFT",
            index: true
        },


        // =================================================
        // PDF
        // =================================================

        pdfUrl: {
            type: String,
            trim: true
        },


        // =================================================
        // NOTES
        // =================================================

       notes: {
            type: String,
            trim: true,
            maxlength: 2000
        },


        // =================================================
        // GENERATED INFORMATION
        // =================================================

        generatedAt: {
            type: Date
        },

        generatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },

        finalizedAt: {
            type: Date
        },

        finalizedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }

    },

    {
        timestamps: true
    }
);


// =====================================================
// INDEXES
// =====================================================

// One payslip per employee per payroll month/year
payslipSchema.index(
    {
        organizationId: 1,
        employee: 1,
        payrollMonth: 1,
        payrollYear: 1
    },
    {
        unique: true
    }
);


// Fast payroll history searches
payslipSchema.index({
    organizationId: 1,
    payrollYear: -1,
    payrollMonth: -1
});


// Fast employee payslip history
payslipSchema.index({
    employee: 1,
    payrollYear: -1,
    payrollMonth: -1
});


// =====================================================
// PRE VALIDATE
// =====================================================

payslipSchema.pre("validate", function (next) {

    // -----------------------------------------------
    // Calculate Gross Salary
    // -----------------------------------------------

    const earnings = this.earnings || {};

    this.grossSalary =
        Number(earnings.basicSalary || 0) +
        Number(earnings.hra || 0) +
        Number(earnings.conveyanceAllowance || 0) +
        Number(earnings.medicalAllowance || 0) +
        Number(earnings.specialAllowance || 0) +
        Number(earnings.otherAllowance || 0) +
        Number(earnings.overtime || 0) +
        Number(earnings.bonus || 0) +
        Number(earnings.incentive || 0);


    // -----------------------------------------------
    // Calculate Total Deductions
    // -----------------------------------------------

    const deductions = this.deductions || {};

    this.totalDeductions =
        Number(deductions.providentFund || 0) +
        Number(deductions.professionalTax || 0) +
        Number(deductions.tds || 0) +
        Number(deductions.esi || 0) +
        Number(deductions.loanDeduction || 0) +
        Number(deductions.lopDeduction || 0) +
        Number(deductions.otherDeduction || 0);


    // -----------------------------------------------
    // Calculate Net Salary
    // -----------------------------------------------

    this.netSalary = Math.max(
        0,
        this.grossSalary - this.totalDeductions
    );


    next();

});


// =====================================================
// EXPORT
// =====================================================

const Payslip = mongoose.model(
    "Payslip",
    payslipSchema
);

module.exports = Payslip;