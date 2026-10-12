
const mongoose = require("mongoose");

const Employee = require("../models/Employee");
const SalaryStructure = require("../models/SalaryStructure");
const Payroll = require("../models/Payroll");

// =====================================================
// CONSTANTS
// =====================================================

const PAYROLL_STATUSES = [
    "Draft",
    "Approved",
    "Paid",
    "Cancelled"
];

const MAX_PAYROLL_EMPLOYEES = 1000;

// =====================================================
// VALIDATION HELPERS
// =====================================================

function validateObjectId(id, fieldName = "ID") {
    if (!mongoose.isValidObjectId(id)) {
        throw new Error(`Invalid ${fieldName}.`);
    }
}

function validateMonthYear(month, year) {
    const parsedMonth = Number(month);
    const parsedYear = Number(year);

    if (
        !Number.isInteger(parsedMonth) ||
        parsedMonth < 1 ||
        parsedMonth > 12
    ) {
        throw new Error("Month must be between 1 and 12.");
    }

    if (
        !Number.isInteger(parsedYear) ||
        parsedYear < 2000 ||
        parsedYear > 2200
    ) {
        throw new Error("Please provide a valid payroll year.");
    }

    return {
        month: parsedMonth,
        year: parsedYear
    };
}

function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function toNonNegativeNumber(value, fieldName) {
    const number = Number(value ?? 0);

    if (!Number.isFinite(number) || number < 0) {
        throw new Error(
            `${fieldName} must be a non-negative number.`
        );
    }

    return roundMoney(number);
}

function getDaysInMonth(month, year) {
    return new Date(year, month, 0).getDate();
}

// =====================================================
// SALARY CALCULATION
// =====================================================

function calculateSalary({
    basicSalary,
    allowances = {},
    deductions = {},
    unpaidLeaveDays = 0,
    payableDays,
    totalDays
}) {
    const basic = toNonNegativeNumber(
        basicSalary,
        "Basic salary"
    );

    if (
        !allowances ||
        typeof allowances !== "object" ||
        Array.isArray(allowances)
    ) {
        throw new Error("Allowances must be an object.");
    }

    if (
        !deductions ||
        typeof deductions !== "object" ||
        Array.isArray(deductions)
    ) {
        throw new Error("Deductions must be an object.");
    }

    const normalizedAllowances = {};
    const normalizedDeductions = {};

    for (const [name, amount] of Object.entries(allowances)) {
        normalizedAllowances[name] = toNonNegativeNumber(
            amount,
            `Allowance "${name}"`
        );
    }

    for (const [name, amount] of Object.entries(deductions)) {
        normalizedDeductions[name] = toNonNegativeNumber(
            amount,
            `Deduction "${name}"`
        );
    }

    const totalAllowances = roundMoney(
        Object.values(normalizedAllowances).reduce(
            (sum, amount) => sum + amount,
            0
        )
    );

    const grossSalary = roundMoney(basic + totalAllowances);

    const totalDeductions = roundMoney(
        Object.values(normalizedDeductions).reduce(
            (sum, amount) => sum + amount,
            0
        )
    );

    const unpaidDays = toNonNegativeNumber(
        unpaidLeaveDays,
        "Unpaid leave days"
    );

    let payableBasic = basic;
    let payableAllowances = totalAllowances;

    if (totalDays !== undefined || payableDays !== undefined) {
        const days = Number(totalDays);
        const payable = Number(payableDays);

        if (
            !Number.isInteger(days) ||
            days < 1 ||
            !Number.isFinite(payable) ||
            payable < 0 ||
            payable > days
        ) {
            throw new Error("Invalid payable days or total days.");
        }

        const ratio = payable / days;

        payableBasic = roundMoney(basic * ratio);
        payableAllowances = roundMoney(totalAllowances * ratio);
    }

    const payableGross = roundMoney(
        payableBasic + payableAllowances
    );

    const netSalary = roundMoney(
        payableGross - totalDeductions
    );

    if (netSalary < 0) {
        throw new Error(
            "Total deductions cannot exceed payable gross salary."
        );
    }

    return {
        basicSalary: basic,
        allowances: normalizedAllowances,
        totalAllowances,
        grossSalary,
        deductions: normalizedDeductions,
        totalDeductions,
        unpaidLeaveDays: unpaidDays,
        payableBasic,
        payableAllowances,
        payableGross,
        netSalary
    };
}

// =====================================================
// GET EMPLOYEE
// =====================================================

async function getEmployee(organizationId, employeeId) {
    validateObjectId(organizationId, "organization ID");
    validateObjectId(employeeId, "employee ID");

    const employee = await Employee.findOne({
        _id: employeeId,
        organization: organizationId,
        status: { $ne: "Exited" }
    }).lean();

    if (!employee) {
        throw new Error(
            "Employee not found in this organization."
        );
    }

    return employee;
}

// =====================================================
// CREATE SALARY STRUCTURE
// =====================================================

async function createSalaryStructure({
    organizationId,
    employeeId,
    basicSalary,
    allowances = {},
    deductions = {},
    effectiveFrom,
    effectiveTo = null
}) {
    const employee = await getEmployee(
        organizationId,
        employeeId
    );

    const basic = toNonNegativeNumber(
        basicSalary,
        "Basic salary"
    );

    if (basic <= 0) {
        throw new Error("Basic salary must be greater than zero.");
    }

    if (!effectiveFrom || Number.isNaN(Date.parse(effectiveFrom))) {
        throw new Error("A valid effective-from date is required.");
    }

    const start = new Date(effectiveFrom);

    let end = null;

    if (effectiveTo) {
        if (Number.isNaN(Date.parse(effectiveTo))) {
            throw new Error("Invalid effective-to date.");
        }

        end = new Date(effectiveTo);

        if (end < start) {
            throw new Error(
                "Effective-to date cannot precede effective-from date."
            );
        }
    }

    const salary = calculateSalary({
        basicSalary: basic,
        allowances,
        deductions
    });

    // Prevent overlapping effective salary structures.
    const overlapping = await SalaryStructure.findOne({
        organization: organizationId,
        employee: employee._id,
        effectiveFrom: { $lte: end || new Date("2200-12-31") },
        $or: [
            { effectiveTo: null },
            { effectiveTo: { $exists: false } },
            { effectiveTo: { $gte: start } }
        ],
        status: "Active"
    }).lean();

    if (overlapping) {
        throw new Error(
            "An active salary structure overlaps this effective period. Close or update the existing structure first."
        );
    }

    return SalaryStructure.create({
        organization: organizationId,
        employee: employee._id,
        basicSalary: salary.basicSalary,
        allowances: salary.allowances,
        deductions: salary.deductions,
        grossSalary: salary.grossSalary,
        effectiveFrom: start,
        effectiveTo: end,
        status: "Active"
    });
}

// =====================================================
// GET ACTIVE SALARY STRUCTURE
// =====================================================

async function getActiveSalaryStructure(
    organizationId,
    employeeId,
    payrollDate
) {
    return SalaryStructure.findOne({
        organization: organizationId,
        employee: employeeId,
        status: "Active",
        effectiveFrom: { $lte: payrollDate },
        $or: [
            { effectiveTo: null },
            { effectiveTo: { $exists: false } },
            { effectiveTo: { $gte: payrollDate } }
        ]
    })
        .sort({ effectiveFrom: -1 })
        .lean();
}

// =====================================================
// GENERATE DRAFT PAYROLL
// =====================================================

async function generatePayroll({
    organizationId,
    month,
    year,
    employeeIds = []
}) {
    validateObjectId(organizationId, "organization ID");

    const period = validateMonthYear(month, year);
    const { month: payrollMonth, year: payrollYear } = period;

    if (!Array.isArray(employeeIds)) {
        throw new Error("employeeIds must be an array.");
    }

    if (employeeIds.length > MAX_PAYROLL_EMPLOYEES) {
        throw new Error(
            `Maximum ${MAX_PAYROLL_EMPLOYEES} employees per payroll run.`
        );
    }

    for (const employeeId of employeeIds) {
        validateObjectId(employeeId, "employee ID");
    }

    const uniqueEmployeeIds = [
        ...new Set(employeeIds.map(String))
    ];

    const employeesFilter = {
        organization: organizationId,
        status: { $ne: "Exited" }
    };

    if (uniqueEmployeeIds.length > 0) {
        employeesFilter._id = { $in: uniqueEmployeeIds };
    }

    const employees = await Employee.find(employeesFilter)
        .select("_id employeeId firstName lastName organization status")
        .lean();

    if (
        uniqueEmployeeIds.length > 0 &&
        employees.length !== uniqueEmployeeIds.length
    ) {
        throw new Error(
            "One or more employees do not belong to this organization or are not eligible."
        );
    }

    const payrollDate = new Date(
        Date.UTC(payrollYear, payrollMonth - 1, 1)
    );

    const totalDays = getDaysInMonth(
        payrollMonth,
        payrollYear
    );

    const payrollRecords = [];

    for (const employee of employees) {
        const existing = await Payroll.findOne({
            organization: organizationId,
            employee: employee._id,
            month: payrollMonth,
            year: payrollYear
        }).lean();

        if (existing) {
            // Never overwrite an existing payroll record.
            continue;
        }

        const structure = await getActiveSalaryStructure(
            organizationId,
            employee._id,
            payrollDate
        );

        if (!structure) {
            payrollRecords.push({
                employeeId: employee._id,
                employeeCode: employee.employeeId,
                employeeName: `${employee.firstName || ""} ${employee.lastName || ""}`.trim(),
                status: "Skipped",
                reason: "No active salary structure for this payroll period."
            });

            continue;
        }

        const salary = calculateSalary({
            basicSalary: structure.basicSalary,
            allowances: structure.allowances || {},
            deductions: structure.deductions || {}
        });

        payrollRecords.push({
            organization: organizationId,
            employee: employee._id,
            month: payrollMonth,
            year: payrollYear,
            totalDays,
            payableDays: totalDays,
            unpaidLeaveDays: 0,
            basicSalary: salary.basicSalary,
            allowances: salary.allowances,
            totalAllowances: salary.totalAllowances,
            grossSalary: salary.grossSalary,
            deductions: salary.deductions,
            totalDeductions: salary.totalDeductions,
            netSalary: salary.netSalary,
            status: "Draft"
        });
    }

    const toInsert = payrollRecords.filter(
        (record) => record.status === "Draft"
    );

    let created = [];

    if (toInsert.length > 0) {
        try {
            created = await Payroll.insertMany(toInsert, {
                ordered: false
            });
        } catch (error) {
            // unordered inserts may partially succeed.
            // Do not report this as a fully successful run.
            if (error.insertedDocs) {
                created = error.insertedDocs;
            }

            if (error.code !== 11000 && !error.writeErrors) {
                throw error;
            }
        }
    }

    const skipped = payrollRecords.filter(
        (record) => record.status === "Skipped"
    );

    return {
        month: payrollMonth,
        year: payrollYear,
        totalEmployees: employees.length,
        createdCount: created.length,
        skipped,
        message:
            "Draft payroll generation finished. Review records before approval."
    };
}

// =====================================================
// GET PAYROLL RECORDS
// =====================================================

async function getPayrollRecords(
    organizationId,
    { month, year, status, page = 1, limit = 20 } = {}
) {
    validateObjectId(organizationId, "organization ID");

    const filter = {
        organization: organizationId
    };

    if (month !== undefined || year !== undefined) {
        if (month === undefined || year === undefined) {
            throw new Error(
                "Month and year must be provided together."
            );
        }

        const period = validateMonthYear(month, year);
        filter.month = period.month;
        filter.year = period.year;
    }

    if (status) {
        if (!PAYROLL_STATUSES.includes(status)) {
            throw new Error("Invalid payroll status.");
        }

        filter.status = status;
    }

    const currentPage = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(
        100,
        Math.max(1, Number(limit) || 20)
    );

    const [records, total] = await Promise.all([
        Payroll.find(filter)
            .populate(
                "employee",
                "employeeId firstName lastName email department designation"
            )
            .sort({ year: -1, month: -1, createdAt: -1 })
            .skip((currentPage - 1) * pageSize)
            .limit(pageSize)
            .lean(),

        Payroll.countDocuments(filter)
    ]);

    return {
        records,
        pagination: {
            page: currentPage,
            limit: pageSize,
            total,
            pages: Math.ceil(total / pageSize)
        }
    };
}

// =====================================================
// GET ONE PAYSLIP
// =====================================================

async function getPayslip(
    organizationId,
    payrollId,
    { employeeId } = {}
) {
    validateObjectId(organizationId, "organization ID");
    validateObjectId(payrollId, "payroll ID");

    const filter = {
        _id: payrollId,
        organization: organizationId
    };

    // When an employee requests a payslip, ownership is mandatory.
    if (employeeId) {
        validateObjectId(employeeId, "employee ID");
        filter.employee = employeeId;
    }

    const payroll = await Payroll.findOne(filter)
        .populate(
            "employee",
            "employeeId firstName lastName email department designation"
        )
        .lean();

    if (!payroll) {
        throw new Error("Payslip not found.");
    }

    return payroll;
}

// =====================================================
// APPROVE DRAFT PAYROLL
// =====================================================

async function approvePayroll(organizationId, payrollId) {
    validateObjectId(organizationId, "organization ID");
    validateObjectId(payrollId, "payroll ID");

    const payroll = await Payroll.findOneAndUpdate(
        {
            _id: payrollId,
            organization: organizationId,
            status: "Draft"
        },
        {
            $set: {
                status: "Approved",
                approvedAt: new Date()
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!payroll) {
        throw new Error(
            "Draft payroll not found or it has already been processed."
        );
    }

    return payroll;
}

// =====================================================
// MARK PAYROLL AS PAID
// =====================================================

// This only records a payment status. It does NOT transfer money.
// Call only after payment is independently confirmed.
async function markPayrollAsPaid(
    organizationId,
    payrollId,
    { paymentReference } = {}
) {
    validateObjectId(organizationId, "organization ID");
    validateObjectId(payrollId, "payroll ID");

    if (
        paymentReference !== undefined &&
        (
            typeof paymentReference !== "string" ||
            paymentReference.trim().length > 150
        )
    ) {
        throw new Error("Invalid payment reference.");
    }

    const update = {
        status: "Paid",
        paidAt: new Date()
    };

    if (paymentReference) {
        update.paymentReference = paymentReference.trim();
    }

    const payroll = await Payroll.findOneAndUpdate(
        {
            _id: payrollId,
            organization: organizationId,
            status: "Approved"
        },
        {
            $set: update
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!payroll) {
        throw new Error(
            "Approved payroll not found. Only approved payroll can be marked paid."
        );
    }

    return payroll;
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    calculateSalary,
    createSalaryStructure,
    getActiveSalaryStructure,
    generatePayroll,
    getPayrollRecords,
    getPayslip,
    approvePayroll,
    markPayrollAsPaid
};