const mongoose = require("mongoose");


// =====================================================
// SALARY STRUCTURE SCHEMA
// =====================================================

const salaryStructureSchema = new mongoose.Schema(
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
        // BASIC SALARY
        // =================================================

        basicSalary: {
            type: Number,
            required: true,
            min: 0,
            default: 0
        },


        // =================================================
        // ALLOWANCES
        // =================================================

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


        // =================================================
        // DEDUCTIONS
        // =================================================

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

        otherDeduction: {
            type: Number,
            default: 0,
            min: 0
        },


        // =================================================
        // CALCULATED TOTALS
        // =================================================

        grossSalary: {
            type: Number,
            default: 0,
            min: 0
        },

        totalDeductions: {
            type: Number,
            default: 0,
            min: 0
        },

        netSalary: {
            type: Number,
            default: 0,
            min: 0
        },


        // =================================================
        // EFFECTIVE DATE
        // =================================================

        effectiveFrom: {
            type: Date,
            required: true,
            default: Date.now
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
        }

    },

    {
        timestamps: true
    }
);


// =====================================================
// CALCULATE SALARY TOTALS
// =====================================================

salaryStructureSchema.pre(
    "validate",
    function (next) {

        // -----------------------------------------------
        // Gross Salary
        // -----------------------------------------------

        this.grossSalary =
            Number(this.basicSalary || 0) +
            Number(this.hra || 0) +
            Number(this.conveyanceAllowance || 0) +
            Number(this.medicalAllowance || 0) +
            Number(this.specialAllowance || 0) +
            Number(this.otherAllowance || 0);


        // -----------------------------------------------
        // Total Deductions
        // -----------------------------------------------

        this.totalDeductions =
            Number(this.providentFund || 0) +
            Number(this.professionalTax || 0) +
            Number(this.tds || 0) +
            Number(this.otherDeduction || 0);


        // -----------------------------------------------
        // Net Salary
        // -----------------------------------------------

        this.netSalary = Math.max(
            0,
            this.grossSalary - this.totalDeductions
        );


        next();

    }
);


// =====================================================
// INDEXES
// =====================================================

// Employee salary history
salaryStructureSchema.index({
    organizationId: 1,
    employee: 1,
    effectiveFrom: -1
});


// Active salary structure lookup
salaryStructureSchema.index({
    organizationId: 1,
    employee: 1,
    status: 1
});


// =====================================================
// EXPORT
// =====================================================

module.exports = mongoose.model(
    "SalaryStructure",
    salaryStructureSchema
);