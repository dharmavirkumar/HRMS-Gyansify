
const mongoose = require("mongoose");

const payrollItemSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true
        },

        payroll: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Payroll",
            required: true,
            index: true
        },

        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true
        },

        salaryStructure: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SalaryStructure",
            required: true
        },

        // Snapshot: employee details at processing time
        employeeCode: {
            type: String,
            trim: true,
            required: true
        },

        employeeName: {
            type: String,
            trim: true,
            required: true
        },

        email: {
            type: String,
            trim: true,
            lowercase: true,
            default: ""
        },

        payrollMonth: {
            type: Number,
            required: true,
            min: 1,
            max: 12
        },

        payrollYear: {
            type: Number,
            required: true,
            min: 2000,
            max: 2100
        },

        basicSalary: { type: Number, default: 0, min: 0 },
        hra: { type: Number, default: 0, min: 0 },
        conveyanceAllowance: { type: Number, default: 0, min: 0 },
        medicalAllowance: { type: Number, default: 0, min: 0 },
        specialAllowance: { type: Number, default: 0, min: 0 },
        otherAllowance: { type: Number, default: 0, min: 0 },

        grossSalary: { type: Number, required: true, min: 0 },

        providentFund: { type: Number, default: 0, min: 0 },
        professionalTax: { type: Number, default: 0, min: 0 },
        tds: { type: Number, default: 0, min: 0 },
        otherDeduction: { type: Number, default: 0, min: 0 },

        totalDeductions: { type: Number, required: true, min: 0 },
        netSalary: { type: Number, required: true, min: 0 },

        status: {
            type: String,
            enum: ["PROCESSED", "APPROVED", "PAID", "CANCELLED"],
            default: "PROCESSED",
            index: true
        }
    },
    { timestamps: true }
);

// One employee can have only one item in a payroll run.
payrollItemSchema.index(
    { organizationId: 1, payroll: 1, employee: 1 },
    { unique: true }
);

payrollItemSchema.index({
    organizationId: 1,
    payrollYear: -1,
    payrollMonth: -1
});

module.exports =
    mongoose.models.PayrollItem ||
    mongoose.model("PayrollItem", payrollItemSchema);
