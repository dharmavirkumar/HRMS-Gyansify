
const LeaveType = require("../models/LeaveType");
const LeaveBalance = require("../models/LeaveBalance");
const Employee = require("../models/Employee");

// =====================================================
// HELPERS
// =====================================================

function getCurrentYear() {
    return new Date().getFullYear();
}

function validateYear(year) {
    const parsedYear = Number(year);

    if (
        !Number.isInteger(parsedYear) ||
        parsedYear < 2000 ||
        parsedYear > 2200
    ) {
        throw new Error("Invalid leave balance year.");
    }

    return parsedYear;
}

function calculateAvailableBalance(balance) {
    return Math.max(
        0,
        Number(balance.allocated || 0) +
            Number(balance.carriedForward || 0) +
            Number(balance.adjustment || 0) -
            Number(balance.used || 0)
    );
}

// =====================================================
// GET EMPLOYEE
// =====================================================

async function validateEmployee(organizationId, employeeId) {
    if (!organizationId || !employeeId) {
        throw new Error(
            "Organization ID and employee ID are required."
        );
    }

    const employee = await Employee.findOne({
        _id: employeeId,
        organization: organizationId,
        status: { $ne: "Exited" }
    })
        .select("_id organization status")
        .lean();

    if (!employee) {
        throw new Error(
            "Employee not found in this organization."
        );
    }

    return employee;
}

// =====================================================
// INITIALIZE DEFAULT LEAVE BALANCES
// Creates missing balances without resetting existing ones.
// =====================================================

async function createDefaultLeaveBalances(
    organizationId,
    employeeId,
    year = getCurrentYear()
) {
    const selectedYear = validateYear(year);

    await validateEmployee(organizationId, employeeId);

    const leaveTypes = await LeaveType.find({
        organization: organizationId,
        status: "Active"
    })
        .select("_id annualLimit")
        .lean();

    if (leaveTypes.length === 0) {
        throw new Error(
            "No active leave types found for this organization."
        );
    }

    const operations = leaveTypes.map((leaveType) => ({
        updateOne: {
            filter: {
                organization: organizationId,
                employee: employeeId,
                leaveType: leaveType._id,
                year: selectedYear
            },
            update: {
                $setOnInsert: {
                    organization: organizationId,
                    employee: employeeId,
                    leaveType: leaveType._id,
                    year: selectedYear,
                    allocated: Number(leaveType.annualLimit || 0),
                    carriedForward: 0,
                    used: 0,
                    adjustment: 0,
                    status: "Active"
                }
            },
            upsert: true
        }
    }));

    const result = await LeaveBalance.bulkWrite(
        operations,
        { ordered: true }
    );

    return {
        year: selectedYear,
        leaveTypes: leaveTypes.length,
        created: result.upsertedCount || 0,
        matched: result.matchedCount || 0
    };
}

// =====================================================
// GET EMPLOYEE LEAVE BALANCES
// =====================================================

async function getEmployeeLeaveBalances(
    organizationId,
    employeeId,
    year = getCurrentYear()
) {
    const selectedYear = validateYear(year);

    await validateEmployee(organizationId, employeeId);

    const balances = await LeaveBalance.find({
        organization: organizationId,
        employee: employeeId,
        year: selectedYear,
        status: "Active"
    })
        .populate({
            path: "leaveType",
            select: "name code isPaid annualLimit allowCarryForward"
        })
        .sort({ createdAt: 1 })
        .lean();

    return balances.map((balance) => ({
        ...balance,
        available: calculateAvailableBalance(balance)
    }));
}

// =====================================================
// GET ONE LEAVE BALANCE
// =====================================================

async function getLeaveBalance(
    organizationId,
    employeeId,
    leaveTypeId,
    year = getCurrentYear()
) {
    const selectedYear = validateYear(year);

    await validateEmployee(organizationId, employeeId);

    const balance = await LeaveBalance.findOne({
        organization: organizationId,
        employee: employeeId,
        leaveType: leaveTypeId,
        year: selectedYear,
        status: "Active"
    }).lean();

    if (!balance) {
        throw new Error(
            "Leave balance not found. Initialize the employee's leave balances first."
        );
    }

    return {
        ...balance,
        available: calculateAvailableBalance(balance)
    };
}

// =====================================================
// CHECK AVAILABLE LEAVES
// =====================================================

async function checkAvailableLeaves(
    organizationId,
    employeeId,
    leaveTypeId,
    requestedDays,
    year = getCurrentYear()
) {
    const days = Number(requestedDays);

    if (!Number.isFinite(days) || days <= 0) {
        throw new Error(
            "Requested leave days must be greater than zero."
        );
    }

    const balance = await getLeaveBalance(
        organizationId,
        employeeId,
        leaveTypeId,
        year
    );

    return {
        allowed: balance.available >= days,
        requestedDays: days,
        available: balance.available,
        remainingAfterRequest: balance.available - days,
        balance
    };
}

// =====================================================
// RECORD APPROVED LEAVE USAGE
//
// Call only after a leave request has been approved.
// Use a MongoDB transaction and an idempotency mechanism
// in the approval workflow to prevent double deductions.
// =====================================================

async function recordLeaveUsage(
    organizationId,
    employeeId,
    leaveTypeId,
    days,
    year = getCurrentYear()
) {
    const selectedYear = validateYear(year);
    const requestedDays = Number(days);

    if (
        !Number.isFinite(requestedDays) ||
        requestedDays <= 0
    ) {
        throw new Error(
            "Leave usage must be greater than zero."
        );
    }

    await validateEmployee(organizationId, employeeId);

    const balance = await LeaveBalance.findOneAndUpdate(
        {
            organization: organizationId,
            employee: employeeId,
            leaveType: leaveTypeId,
            year: selectedYear,
            status: "Active",
            $expr: {
                $gte: [
                    {
                        $subtract: [
                            {
                                $add: [
                                    { $ifNull: ["$allocated", 0] },
                                    { $ifNull: ["$carriedForward", 0] },
                                    { $ifNull: ["$adjustment", 0] }
                                ]
                            },
                            { $ifNull: ["$used", 0] }
                        ]
                    },
                    requestedDays
                ]
            }
        },
        {
            $inc: {
                used: requestedDays
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!balance) {
        throw new Error(
            "Insufficient leave balance or active balance not found."
        );
    }

    return {
        ...balance.toObject(),
        available: calculateAvailableBalance(balance)
    };
}

// =====================================================
// REVERSE LEAVE USAGE
//
// Call only when an approved leave is cancelled/reversed.
// Approval workflow must ensure it is reversed once only.
// =====================================================

async function reverseLeaveUsage(
    organizationId,
    employeeId,
    leaveTypeId,
    days,
    year = getCurrentYear()
) {
    const selectedYear = validateYear(year);
    const requestedDays = Number(days);

    if (
        !Number.isFinite(requestedDays) ||
        requestedDays <= 0
    ) {
        throw new Error(
            "Reversed leave days must be greater than zero."
        );
    }

    await validateEmployee(organizationId, employeeId);

    const balance = await LeaveBalance.findOneAndUpdate(
        {
            organization: organizationId,
            employee: employeeId,
            leaveType: leaveTypeId,
            year: selectedYear,
            status: "Active",
            used: { $gte: requestedDays }
        },
        {
            $inc: {
                used: -requestedDays
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!balance) {
        throw new Error(
            "Leave usage could not be reversed. Check the balance and previous deduction."
        );
    }

    return {
        ...balance.toObject(),
        available: calculateAvailableBalance(balance)
    };
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    createDefaultLeaveBalances,
    getEmployeeLeaveBalances,
    getLeaveBalance,
    checkAvailableLeaves,
    recordLeaveUsage,
    reverseLeaveUsage,
    calculateAvailableBalance
};