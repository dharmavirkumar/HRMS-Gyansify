
const mongoose = require("mongoose");

const Employee = require("../models/Employee");
const LeaveType = require("../models/LeaveType");
const LeaveRequest = require("../models/LeaveRequest");

const {
    checkAvailableLeaves
} = require("./leaveBalanceService");

// =====================================================
// CONSTANTS
// =====================================================

const ALLOWED_STATUSES = [
    "Pending",
    "Approved",
    "Rejected",
    "Cancelled"
];

// =====================================================
// VALIDATION HELPERS
// =====================================================

function validateObjectId(id, fieldName) {
    if (!mongoose.isValidObjectId(id)) {
        throw new Error(`Invalid ${fieldName}.`);
    }
}

function parseDate(value, fieldName) {
    if (!value) {
        throw new Error(`${fieldName} is required.`);
    }

    // Expect YYYY-MM-DD to avoid ambiguous date formats.
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        throw new Error(
            `${fieldName} must use YYYY-MM-DD format.`
        );
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
    ) {
        throw new Error(`Invalid ${fieldName}.`);
    }

    return value;
}

function calculateLeaveDays(fromDate, toDate) {
    const start = new Date(`${fromDate}T00:00:00.000Z`);
    const end = new Date(`${toDate}T00:00:00.000Z`);

    const difference = end.getTime() - start.getTime();

    return Math.floor(difference / 86400000) + 1;
}

function getYearFromDate(date) {
    return Number(date.slice(0, 4));
}

function getDateRange(fromDate, toDate) {
    return {
        $gte: fromDate,
        $lte: toDate
    };
}

// =====================================================
// VALIDATE EMPLOYEE
// =====================================================

async function validateEmployee(organizationId, employeeId) {
    validateObjectId(organizationId, "organization ID");
    validateObjectId(employeeId, "employee ID");

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
// VALIDATE LEAVE TYPE
// =====================================================

async function validateLeaveType(organizationId, leaveTypeId) {
    validateObjectId(leaveTypeId, "leave type ID");

    const leaveType = await LeaveType.findOne({
        _id: leaveTypeId,
        organization: organizationId,
        status: "Active"
    }).lean();

    if (!leaveType) {
        throw new Error(
            "Active leave type not found for this organization."
        );
    }

    return leaveType;
}

// =====================================================
// CHECK OVERLAPPING LEAVE REQUESTS
// =====================================================

async function checkOverlappingLeave(
    employeeId,
    fromDate,
    toDate,
    excludeRequestId = null
) {
    const filter = {
        employee: employeeId,
        status: { $in: ["Pending", "Approved"] },
        fromDate: { $lte: toDate },
        toDate: { $gte: fromDate }
    };

    if (excludeRequestId) {
        filter._id = { $ne: excludeRequestId };
    }

    const overlappingRequest = await LeaveRequest.findOne(filter)
        .select("_id fromDate toDate status")
        .lean();

    if (overlappingRequest) {
        throw new Error(
            "A pending or approved leave request already overlaps these dates."
        );
    }

    return true;
}

// =====================================================
// APPLY FOR LEAVE
// =====================================================

async function applyLeave({
    organizationId,
    employeeId,
    leaveTypeId,
    fromDate,
    toDate,
    reason
}) {
    const employee = await validateEmployee(
        organizationId,
        employeeId
    );

    const leaveType = await validateLeaveType(
        organizationId,
        leaveTypeId
    );

    const startDate = parseDate(fromDate, "Start date");
    const endDate = parseDate(toDate, "End date");

    if (endDate < startDate) {
        throw new Error(
            "End date cannot be before start date."
        );
    }

    if (
        typeof reason !== "string" ||
        reason.trim().length < 3
    ) {
        throw new Error(
            "Please provide a valid leave reason."
        );
    }

    if (reason.trim().length > 1000) {
        throw new Error(
            "Leave reason cannot exceed 1000 characters."
        );
    }

    // Basic calendar-day calculation.
    // Weekends/holidays/half-days need organization policy integration.
    const days = calculateLeaveDays(startDate, endDate);

    await checkOverlappingLeave(
        employee._id,
        startDate,
        endDate
    );

    // Leave without pay does not require a paid balance.
    if (leaveType.isPaid && days > 0) {
        const balanceCheck = await checkAvailableLeaves(
            organizationId,
            employee._id,
            leaveType._id,
            days,
            getYearFromDate(startDate)
        );

        if (!balanceCheck.allowed) {
            throw new Error(
                `Insufficient leave balance. Available: ${balanceCheck.available} day(s).`
            );
        }
    }

    return LeaveRequest.create({
        organization: organizationId,
        employee: employee._id,
        leaveType: leaveType._id,
        fromDate: startDate,
        toDate: endDate,
        days,
        reason: reason.trim(),
        status: "Pending"
    });
}

// =====================================================
// GET EMPLOYEE LEAVE REQUESTS
// =====================================================

async function getEmployeeLeaveRequests(
    organizationId,
    employeeId,
    { status, page = 1, limit = 20 } = {}
) {
    await validateEmployee(organizationId, employeeId);

    const filter = {
        organization: organizationId,
        employee: employeeId
    };

    if (status) {
        if (!ALLOWED_STATUSES.includes(status)) {
            throw new Error("Invalid leave request status.");
        }

        filter.status = status;
    }

    const currentPage = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(
        100,
        Math.max(1, Number(limit) || 20)
    );

    const [requests, total] = await Promise.all([
        LeaveRequest.find(filter)
            .populate("leaveType", "name code isPaid")
            .sort({ createdAt: -1 })
            .skip((currentPage - 1) * pageSize)
            .limit(pageSize)
            .lean(),

        LeaveRequest.countDocuments(filter)
    ]);

    return {
        requests,
        pagination: {
            page: currentPage,
            limit: pageSize,
            total,
            pages: Math.ceil(total / pageSize)
        }
    };
}

// =====================================================
// GET ONE EMPLOYEE LEAVE REQUEST
// =====================================================

async function getEmployeeLeaveRequest(
    organizationId,
    employeeId,
    requestId
) {
    validateObjectId(requestId, "leave request ID");

    await validateEmployee(organizationId, employeeId);

    const request = await LeaveRequest.findOne({
        _id: requestId,
        organization: organizationId,
        employee: employeeId
    })
        .populate("leaveType", "name code isPaid")
        .lean();

    if (!request) {
        throw new Error("Leave request not found.");
    }

    return request;
}

// =====================================================
// CANCEL PENDING LEAVE REQUEST
// =====================================================

async function cancelLeaveRequest(
    organizationId,
    employeeId,
    requestId
) {
    validateObjectId(requestId, "leave request ID");

    await validateEmployee(organizationId, employeeId);

    const request = await LeaveRequest.findOne({
        _id: requestId,
        organization: organizationId,
        employee: employeeId,
        status: "Pending"
    });

    if (!request) {
        throw new Error(
            "Pending leave request not found or cannot be cancelled."
        );
    }

    request.status = "Cancelled";

    await request.save();

    return request;
}

// =====================================================
// GET ORGANIZATION LEAVE REQUESTS
// HR / authorized managers only; enforce role access in
// the controller/routes before calling this function.
// =====================================================

async function getOrganizationLeaveRequests(
    organizationId,
    { status, page = 1, limit = 20 } = {}
) {
    validateObjectId(organizationId, "organization ID");

    const filter = {
        organization: organizationId
    };

    if (status) {
        if (!ALLOWED_STATUSES.includes(status)) {
            throw new Error("Invalid leave request status.");
        }

        filter.status = status;
    }

    const currentPage = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(
        100,
        Math.max(1, Number(limit) || 20)
    );

    const [requests, total] = await Promise.all([
        LeaveRequest.find(filter)
            .populate("employee", "employeeId firstName lastName email")
            .populate("leaveType", "name code isPaid")
            .sort({ createdAt: -1 })
            .skip((currentPage - 1) * pageSize)
            .limit(pageSize)
            .lean(),

        LeaveRequest.countDocuments(filter)
    ]);

    return {
        requests,
        pagination: {
            page: currentPage,
            limit: pageSize,
            total,
            pages: Math.ceil(total / pageSize)
        }
    };
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    applyLeave,
    getEmployeeLeaveRequests,
    getEmployeeLeaveRequest,
    cancelLeaveRequest,
    getOrganizationLeaveRequests,
    checkOverlappingLeave,
    calculateLeaveDays
};