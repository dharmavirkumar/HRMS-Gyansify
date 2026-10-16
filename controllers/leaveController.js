
"use strict";

const mongoose = require("mongoose");

const LeaveType = require("../models/LeaveType");
const LeaveRequest = require("../models/LeaveRequest");
const LeaveBalance = require("../models/LeaveBalance");
const Employee = require("../models/Employee");
const User = require("../models/User");

// =====================================================
// CONSTANTS
// =====================================================

const LEAVE_STATUSES = [
    "Pending",
    "Approved",
    "Rejected",
    "Cancelled"
];

const ACTIVE_EMPLOYEE_FILTER = {
    status: { $ne: "Exited" }
};

// =====================================================
// GENERAL HELPERS
// =====================================================

const getSessionUser = (req) => req.session?.user || null;

const normalizeId = (value) => {
    if (!value) return null;

    if (value._id) {
        return String(value._id);
    }

    return String(value);
};

const getUserId = (req) => {
    const user = getSessionUser(req);
    return normalizeId(user?._id || user?.id);
};

const getOrganizationId = (req) => {
    const user = getSessionUser(req);

    return normalizeId(
        user?.organizationId ||
        user?.organizationID ||
        user?.organization?._id ||
        user?.organization
    );
};

const isValidObjectId = (value) =>
    typeof value === "string" &&
    mongoose.isValidObjectId(value);

const requireOrganization = (req, res) => {
    const organizationId = getOrganizationId(req);

    if (!organizationId) {
        res.status(400).send(
            "Organization information is missing. Please log in again."
        );
        return null;
    }

    if (!isValidObjectId(organizationId)) {
        res.status(400).send(
            "Invalid organization information. Please log in again."
        );
        return null;
    }

    return organizationId;
};

const handleControllerError = (label, error, res, message) => {
    console.error(`[Leave] ${label}:`, error);

    if (res.headersSent) return;

    return res.status(500).send(message);
};

// =====================================================
// LEAVE TYPE HELPERS
// Your LeaveType schema uses status: Active / Inactive.
// =====================================================

const findActiveLeaveTypes = (organizationId) =>
    LeaveType.find({
        organization: organizationId,
        status: "Active"
    }).sort({ name: 1 });

const findActiveLeaveType = (organizationId, leaveTypeId) =>
    LeaveType.findOne({
        _id: leaveTypeId,
        organization: organizationId,
        status: "Active"
    });

// =====================================================
// CURRENT EMPLOYEE
//
// 1. Load the real User record.
// 2. Verify the session organization.
// 3. Try User.employee reference.
// 4. Fall back to organization + email.
// 5. Repair the User.employee link when possible.
// =====================================================

const getCurrentEmployee = async (req) => {
    const userId = getUserId(req);
    const sessionOrganizationId = getOrganizationId(req);

    if (!userId || !isValidObjectId(userId)) {
        return null;
    }

    if (
        sessionOrganizationId &&
        !isValidObjectId(sessionOrganizationId)
    ) {
        return null;
    }

    const dbUser = await User.findById(userId).select(
        "_id email organization employee status"
    );

    if (!dbUser) return null;

    const organizationId = normalizeId(dbUser.organization);

    if (!organizationId || !isValidObjectId(organizationId)) {
        return null;
    }

    // Prevent a session from switching organizations.
    if (
        sessionOrganizationId &&
        sessionOrganizationId !== organizationId
    ) {
        console.warn("[Leave] Session organization mismatch.", {
            userId
        });

        return null;
    }

    // Do not link employees to disabled login accounts.
    if (dbUser.status && dbUser.status !== "ACTIVE") {
        return null;
    }

    // First choice: explicit employee reference.
    if (
        dbUser.employee &&
        mongoose.isValidObjectId(String(dbUser.employee))
    ) {
        const linkedEmployee = await Employee.findOne({
            _id: dbUser.employee,
            organization: organizationId,
            ...ACTIVE_EMPLOYEE_FILTER
        });

        if (linkedEmployee) {
            if (req.session?.user) {
                req.session.user.employee =
                    String(linkedEmployee._id);
            }

            return linkedEmployee;
        }
    }

    // Fallback: match email only inside this organization.
    const email = String(dbUser.email || "")
        .trim()
        .toLowerCase();

    if (!email) return null;

    const employee = await Employee.findOne({
        organization: organizationId,
        email,
        ...ACTIVE_EMPLOYEE_FILTER
    }).collation({
        locale: "en",
        strength: 2
    });

    if (!employee) {
        console.warn("[Leave] Employee profile not found.", {
            userId,
            organizationId
        });

        return null;
    }

    // Repair the reference only when the employee is not
    // already linked to a different login account.
    const existingLink = await User.findOne({
        employee: employee._id,
        _id: { $ne: dbUser._id }
    }).select("_id");

    if (!existingLink) {
        await User.updateOne(
            {
                _id: dbUser._id,
                organization: organizationId,
                $or: [
                    { employee: null },
                    { employee: { $exists: false } },
                    { employee: employee._id }
                ]
            },
            {
                $set: {
                    employee: employee._id
                }
            },
            {
                runValidators: true
            }
        );
    }

    if (req.session?.user) {
        req.session.user.employee = String(employee._id);
    }

    return employee;
};

const getEmployeeForRequest = async (req, res) => {
    const employee = await getCurrentEmployee(req);

    if (!employee) {
        res.status(404).send(
            "Employee profile not found. Ask HR to link your employee account."
        );

        return null;
    }

    return employee;
};

// =====================================================
// DATE HELPERS
// Use UTC date-only values to avoid server timezone shifts.
// =====================================================

const parseDateOnly = (value) => {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return null;
    }

    const [year, month, day] = value.split("-").map(Number);

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return date;
};

const calculateLeaveDays = (fromDate, toDate) => {
    const start = Date.UTC(
        fromDate.getUTCFullYear(),
        fromDate.getUTCMonth(),
        fromDate.getUTCDate()
    );

    const end = Date.UTC(
        toDate.getUTCFullYear(),
        toDate.getUTCMonth(),
        toDate.getUTCDate()
    );

    return Math.round(
        (end - start) / (24 * 60 * 60 * 1000)
    ) + 1;
};

const getAvailableBalance = (balance) => {
    if (!balance || balance.status === "Inactive") {
        return 0;
    }

    const available =
        Number(balance.allocated || 0) +
        Number(balance.carriedForward || 0) +
        Number(balance.adjustment || 0) -
        Number(balance.used || 0);

    return Math.max(0, available);
};

const getLeaveSummary = (requests = []) => {
    const summary = {
        pending: 0,
        approved: 0,
        rejected: 0,
        cancelled: 0,
        total: requests.length
    };

    for (const request of requests) {
        const status = String(request.status || "").toLowerCase();

        if (
            Object.prototype.hasOwnProperty.call(summary, status) &&
            status !== "total"
        ) {
            summary[status] += 1;
        }
    }

    return summary;
};

const getCurrentYear = () => new Date().getFullYear();

// =====================================================
// GET /leave
// LEAVE DASHBOARD
// =====================================================

exports.getLeaveDashboard = async (req, res) => {
    try {
        const organizationId = requireOrganization(req, res);
        if (!organizationId) return;

        const employee = await getCurrentEmployee(req);
        const currentYear = getCurrentYear();

        const leaveTypes = await findActiveLeaveTypes(
            organizationId
        );

        let balances = [];
        let requests = [];

        if (employee) {
            [
                balances,
                requests
            ] = await Promise.all([
                LeaveBalance.find({
                    organization: organizationId,
                    employee: employee._id,
                    year: currentYear,
                    status: "Active"
                }).populate(
                    "leaveType",
                    "name code isPaid"
                ),

                LeaveRequest.find({
                    organization: organizationId,
                    employee: employee._id
                })
                    .populate("leaveType", "name code isPaid")
                    .sort({ createdAt: -1 })
            ]);
        }

        return res.render("leave/index", {
            title: "Leave Management",
            user: getSessionUser(req),
            employee,
            leaveTypes,
            balances,
            requests,
            summary: getLeaveSummary(requests),
            currentYear
        });
    } catch (error) {
        return handleControllerError(
            "Dashboard",
            error,
            res,
            "Unable to load the leave dashboard."
        );
    }
};

// =====================================================
// GET /leave/apply
// =====================================================

exports.getApplyLeave = async (req, res) => {
    try {
        const organizationId = requireOrganization(req, res);
        if (!organizationId) return;

        const employee = await getEmployeeForRequest(req, res);
        if (!employee) return;

        const leaveTypes = await findActiveLeaveTypes(
            organizationId
        );

        return res.render("leave/apply", {
            title: "Apply for Leave",
            user: getSessionUser(req),
            employee,
            leaveTypes
        });
    } catch (error) {
        return handleControllerError(
            "Apply page",
            error,
            res,
            "Unable to load the apply leave page."
        );
    }
};

// =====================================================
// POST /leave/apply
// =====================================================

exports.applyLeave = async (req, res) => {
    try {
        const organizationId = requireOrganization(req, res);
        if (!organizationId) return;

        const employee = await getEmployeeForRequest(req, res);
        if (!employee) return;

        const {
            leaveType,
            fromDate,
            toDate,
            reason
        } = req.body || {};

        if (
            typeof leaveType !== "string" ||
            !isValidObjectId(leaveType)
        ) {
            return res.status(400).send(
                "Please select a valid leave type."
            );
        }

        if (
            typeof reason !== "string" ||
            !reason.trim() ||
            reason.trim().length > 2000
        ) {
            return res.status(400).send(
                "Please enter a reason for leave (maximum 2000 characters)."
            );
        }

        const start = parseDateOnly(fromDate);
        const end = parseDateOnly(toDate);

        if (!start || !end) {
            return res.status(400).send(
                "Please provide valid dates in YYYY-MM-DD format."
            );
        }

        if (end < start) {
            return res.status(400).send(
                "The end date cannot be before the start date."
            );
        }

        const totalDays = calculateLeaveDays(start, end);

        const selectedLeaveType = await findActiveLeaveType(
            organizationId,
            leaveType
        );

        if (!selectedLeaveType) {
            return res.status(404).send(
                "The selected leave type was not found or is inactive. Please refresh the page or contact HR."
            );
        }

        // This form currently supports full-day date ranges.
        // Half-day requests need an explicit half-day field in
        // the form and a corresponding calculation policy.
        const overlappingRequest = await LeaveRequest.findOne({
            organization: organizationId,
            employee: employee._id,
            status: { $in: ["Pending", "Approved"] },
            fromDate: { $lte: end },
            toDate: { $gte: start }
        }).select("_id");

        if (overlappingRequest) {
            return res.status(400).send(
                "You already have a pending or approved leave request for these dates."
            );
        }

        // This implementation uses a calendar-year balance.
        // Requests spanning two years must be split.
        if (start.getUTCFullYear() !== end.getUTCFullYear()) {
            return res.status(400).send(
                "Please submit separate leave requests for different calendar years."
            );
        }

        // Check paid leave availability at application time.
        // Approval checks it again to protect against stale balances.
        if (selectedLeaveType.isPaid) {
            const balance = await LeaveBalance.findOne({
                organization: organizationId,
                employee: employee._id,
                leaveType: selectedLeaveType._id,
                year: start.getUTCFullYear(),
                status: "Active"
            });

            if (!balance) {
                return res.status(400).send(
                    "Leave balance is unavailable. Contact HR."
                );
            }

            const available = getAvailableBalance(balance);

            if (totalDays > available) {
                return res.status(400).send(
                    `Insufficient leave balance. Available: ${available} day(s).`
                );
            }
        }

        await LeaveRequest.create({
            organization: organizationId,
            employee: employee._id,
            leaveType: selectedLeaveType._id,
            fromDate: start,
            toDate: end,
            totalDays,
            reason: reason.trim(),
            status: "Pending"
        });

        return res.redirect("/leave/my");
    } catch (error) {
        // MongoDB duplicate-key errors should not be exposed
        // as raw database messages.
        if (error?.code === 11000) {
            return res.status(400).send(
                "A conflicting leave record already exists. Please refresh and try again."
            );
        }

        return handleControllerError(
            "Apply leave",
            error,
            res,
            "Unable to submit your leave request."
        );
    }
};

// =====================================================
// GET /leave/my
// MY LEAVE HISTORY + REAL LEAVE BALANCES
// =====================================================

exports.getMyLeaves = async (req, res) => {
    try {
        const organizationId = requireOrganization(req, res);
        if (!organizationId) return;

        const employee = await getEmployeeForRequest(req, res);
        if (!employee) return;

        const currentYear = getCurrentYear();

        const [requests, leaveBalances] = await Promise.all([
            LeaveRequest.find({
                organization: organizationId,
                employee: employee._id
            })
                .populate("leaveType", "name code isPaid")
                .sort({ createdAt: -1 })
                .lean(),

            LeaveBalance.find({
                organization: organizationId,
                employee: employee._id,
                year: currentYear,
                status: "Active"
            })
                .populate("leaveType", "name code isPaid")
                .sort({ createdAt: 1 })
                .lean()
        ]);

        // Calculate available explicitly because lean() does not
        // apply Mongoose virtuals.
        const balancesWithAvailable = leaveBalances.map((balance) => ({
            ...balance,
            available: getAvailableBalance(balance)
        }));

        return res.render("leave/my-leaves", {
            title: "My Leaves",
            user: getSessionUser(req),
            employee,
            leaves: requests,
            requests,
            leaveBalances: balancesWithAvailable,
            balances: balancesWithAvailable,
            summary: getLeaveSummary(requests),
            currentYear,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        return handleControllerError(
            "My leaves",
            error,
            res,
            "Unable to load your leave requests."
        );
    }
};

// =====================================================
// GET /leave/requests
// HR - ALL LEAVE REQUESTS
// =====================================================

exports.getAllLeaveRequests = async (req, res) => {
    try {
        const organizationId = requireOrganization(req, res);
        if (!organizationId) return;

        const requestedStatus = String(
            req.query.status || "Pending"
        );

        const status = [
            ...LEAVE_STATUSES,
            "All"
        ].includes(requestedStatus)
            ? requestedStatus
            : "Pending";

        const query = {
            organization: organizationId
        };

        if (status !== "All") {
            query.status = status;
        }

        const requests = await LeaveRequest.find(query)
            .populate(
                "employee",
                "firstName lastName employeeId email department designation"
            )
            .populate("leaveType", "name code isPaid")
            .populate("reviewedBy", "name email")
            .sort({ createdAt: -1 });

        return res.render("leave/requests", {
            title: "Leave Requests",
            user: getSessionUser(req),
            requests,
            summary: getLeaveSummary(requests),
            currentStatus: status
        });
    } catch (error) {
        return handleControllerError(
            "All leave requests",
            error,
            res,
            "Unable to load leave requests."
        );
    }
};

// =====================================================
// POST /leave/requests/:id/approve
//
// Prevent duplicate approvals by changing Pending -> Approved
// with a conditional update. For paid leave, deduct the balance
// atomically and compensate by restoring Pending if deduction
// cannot be completed.
// =====================================================

exports.approveLeave = async (req, res) => {
    let organizationId;
    let requestId;
    let reservedRequest = false;
    let deductedBalanceId = null;
    let deductedDays = 0;

    try {
        organizationId = requireOrganization(req, res);
        if (!organizationId) return;

        requestId = String(req.params.id || "");

        if (!isValidObjectId(requestId)) {
            return res.status(400).send(
                "Invalid leave request ID."
            );
        }

        const request = await LeaveRequest.findOne({
            _id: requestId,
            organization: organizationId,
            status: "Pending"
        }).populate("leaveType", "name code isPaid");

        if (!request) {
            return res.status(404).send(
                "Pending leave request not found."
            );
        }

        if (!request.leaveType) {
            return res.status(400).send(
                "The leave type associated with this request no longer exists."
            );
        }

        const requestedDays = Number(request.totalDays);

        if (
            !Number.isFinite(requestedDays) ||
            requestedDays <= 0
        ) {
            return res.status(400).send(
                "The requested leave duration is invalid."
            );
        }

        // Atomically reserve the request for approval.
        const approvalUpdate = {
            status: "Approved"
        };

        if (getUserId(req) && isValidObjectId(getUserId(req))) {
            approvalUpdate.reviewedBy = getUserId(req);
        }

        approvalUpdate.reviewedAt = new Date();

        const updatedRequest = await LeaveRequest.findOneAndUpdate(
            {
                _id: requestId,
                organization: organizationId,
                status: "Pending"
            },
            {
                $set: approvalUpdate
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!updatedRequest) {
            return res.status(409).send(
                "This leave request has already been processed. Refresh the page."
            );
        }

        reservedRequest = true;

        if (request.leaveType.isPaid) {
            const year = new Date(request.fromDate).getUTCFullYear();

            // One atomic operation prevents two simultaneous
            // approvals from overspending the same balance.
            const balance = await LeaveBalance.findOneAndUpdate(
                {
                    organization: organizationId,
                    employee: request.employee,
                    leaveType: request.leaveType._id,
                    year,
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
                // Restore the request so HR can resolve the
                // missing/inactive/insufficient balance.
                await LeaveRequest.updateOne(
                    {
                        _id: requestId,
                        organization: organizationId,
                        status: "Approved"
                    },
                    {
                        $set: { status: "Pending" },
                        $unset: {
                            reviewedBy: 1,
                            reviewedAt: 1
                        }
                    }
                );

                reservedRequest = false;

                return res.status(400).send(
                    "Leave balance is missing, inactive, or insufficient. The request remains pending."
                );
            }

            deductedBalanceId = balance._id;
            deductedDays = requestedDays;
        }

        return res.redirect("/leave/requests");
    } catch (error) {
        console.error("[Leave] Approve leave:", error);

        // Best-effort compensation if an error occurs after
        // a balance deduction. A database transaction is the
        // stronger option for replica-set deployments.
        if (deductedBalanceId && deductedDays > 0) {
            try {
                await LeaveBalance.updateOne(
                    {
                        _id: deductedBalanceId,
                        organization: organizationId
                    },
                    {
                        $inc: { used: -deductedDays }
                    }
                );
            } catch (compensationError) {
                console.error(
                    "[Leave] CRITICAL: balance compensation failed:",
                    compensationError
                );
            }
        }

        if (reservedRequest && requestId && organizationId) {
            try {
                await LeaveRequest.updateOne(
                    {
                        _id: requestId,
                        organization: organizationId,
                        status: "Approved"
                    },
                    {
                        $set: { status: "Pending" },
                        $unset: {
                            reviewedBy: 1,
                            reviewedAt: 1
                        }
                    }
                );
            } catch (rollbackError) {
                console.error(
                    "[Leave] CRITICAL: approval rollback failed:",
                    rollbackError
                );
            }
        }

        if (res.headersSent) return;

        return res.status(500).send(
            "Unable to approve the leave request. Please verify the request and balance before retrying."
        );
    }
};

// =====================================================
// POST /leave/requests/:id/reject
// =====================================================

exports.rejectLeave = async (req, res) => {
    try {
        const organizationId = requireOrganization(req, res);
        if (!organizationId) return;

        const requestId = String(req.params.id || "");

        if (!isValidObjectId(requestId)) {
            return res.status(400).send(
                "Invalid leave request ID."
            );
        }

        const remark =
            typeof req.body?.remark === "string"
                ? req.body.remark.trim().slice(0, 2000)
                : "";

        const update = {
            status: "Rejected",
            reviewedAt: new Date(),
            reviewRemark: remark
        };

        const userId = getUserId(req);

        if (userId && isValidObjectId(userId)) {
            update.reviewedBy = userId;
        }

        const request = await LeaveRequest.findOneAndUpdate(
            {
                _id: requestId,
                organization: organizationId,
                status: "Pending"
            },
            {
                $set: update
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!request) {
            return res.status(404).send(
                "Pending leave request not found or already processed."
            );
        }

        return res.redirect("/leave/requests");
    } catch (error) {
        return handleControllerError(
            "Reject leave",
            error,
            res,
            "Unable to reject the leave request."
        );
    }
};

// =====================================================
// POST /leave/my/:id/cancel
// =====================================================

exports.cancelLeave = async (req, res) => {
    try {
        const organizationId = requireOrganization(req, res);
        if (!organizationId) return;

        const employee = await getEmployeeForRequest(req, res);
        if (!employee) return;

        const requestId = String(req.params.id || "");

        if (!isValidObjectId(requestId)) {
            return res.status(400).send(
                "Invalid leave request ID."
            );
        }

        const request = await LeaveRequest.findOneAndUpdate(
            {
                _id: requestId,
                organization: organizationId,
                employee: employee._id,
                status: "Pending"
            },
            {
                $set: {
                    status: "Cancelled"
                }
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!request) {
            return res.status(404).send(
                "Pending leave request not found or you are not allowed to cancel it."
            );
        }

        return res.redirect("/leave/my");
    } catch (error) {
        return handleControllerError(
            "Cancel leave",
            error,
            res,
            "Unable to cancel the leave request."
        );
    }
};
