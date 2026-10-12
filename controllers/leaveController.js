
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

const isValidObjectId = (value) => {
    if (
        typeof value !== "string" &&
        !(value instanceof mongoose.Types.ObjectId)
    ) {
        return false;
    }

    return mongoose.Types.ObjectId.isValid(String(value));
};

const normalizeId = (value) => {
    if (!value) return null;

    if (typeof value === "object" && value._id) {
        return String(value._id);
    }

    return String(value);
};

const getSessionUser = (req) => req.session?.user || null;

const getUserId = (req) => {
    const user = getSessionUser(req);

    return normalizeId(user?._id || user?.id);
};

const getOrganizationId = (req) => {
    const user = getSessionUser(req);

    return normalizeId(
        user?.organizationId ||
        user?.organizationID ||
        user?.organization
    );
};

// =====================================================
// SCHEMA HELPERS
// =====================================================

const schemaHasPath = (Model, path) =>
    Boolean(Model.schema.path(path));

const getFirstSchemaPath = (Model, paths) =>
    paths.find((path) => schemaHasPath(Model, path)) || null;

const getOrganizationField = (Model) =>
    getFirstSchemaPath(Model, [
        "organization",
        "organizationId",
        "organizationID"
    ]);

const getEmployeeField = (Model) =>
    getFirstSchemaPath(Model, [
        "employee",
        "employeeId"
    ]);

const getUserEmployeeField = () =>
    getFirstSchemaPath(User, [
        "employee",
        "employeeId"
    ]);

const getUserOrganizationField = () =>
    getOrganizationField(User);

const getOrganizationFilter = (Model, organizationId) => {
    const field = getOrganizationField(Model);

    if (!field) {
        throw new Error(
            `${Model.modelName} schema has no organization field.`
        );
    }

    return { [field]: organizationId };
};

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
            "Invalid organization information. Please contact your administrator."
        );
        return null;
    }

    return organizationId;
};

// =====================================================
// LEAVE TYPE HELPERS
// Supports isActive and status-based schemas.
// =====================================================

const getActiveLeaveTypeFilter = () => {
    const hasIsActive = schemaHasPath(
        LeaveType,
        "isActive"
    );

    const hasStatus = schemaHasPath(
        LeaveType,
        "status"
    );

    if (hasIsActive && hasStatus) {
        return {
            $or: [
                { isActive: true },
                {
                    status: {
                        $in: ["Active", "ACTIVE", "active"]
                    }
                }
            ]
        };
    }

    if (hasIsActive) {
        return { isActive: true };
    }

    if (hasStatus) {
        return {
            status: {
                $in: ["Active", "ACTIVE", "active"]
            }
        };
    }

    throw new Error(
        "LeaveType must define an isActive or status field."
    );
};

const findActiveLeaveTypes = (organizationId) =>
    LeaveType.find({
        ...getOrganizationFilter(LeaveType, organizationId),
        ...getActiveLeaveTypeFilter()
    }).sort({ name: 1 });

const findActiveLeaveType = (organizationId, leaveTypeId) =>
    LeaveType.findOne({
        _id: leaveTypeId,
        ...getOrganizationFilter(LeaveType, organizationId),
        ...getActiveLeaveTypeFilter()
    });

// =====================================================
// CURRENT EMPLOYEE
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

    const dbUser = await User.findById(userId).lean();

    if (!dbUser) return null;

    const userOrganizationField = getUserOrganizationField();

    if (!userOrganizationField) {
        throw new Error(
            "User schema has no organization field."
        );
    }

    const databaseOrganizationId = normalizeId(
        dbUser[userOrganizationField]
    );

    if (
        !databaseOrganizationId ||
        !isValidObjectId(databaseOrganizationId)
    ) {
        return null;
    }

    // Do not allow cross-organization access.
    if (
        sessionOrganizationId &&
        sessionOrganizationId !== databaseOrganizationId
    ) {
        return null;
    }

    const organizationId = databaseOrganizationId;
    const employeeField = getUserEmployeeField();

    // 1. Try the employee reference on the User document.
    if (
        employeeField &&
        dbUser[employeeField] &&
        isValidObjectId(normalizeId(dbUser[employeeField]))
    ) {
        const employee = await Employee.findOne({
            _id: normalizeId(dbUser[employeeField]),
            ...getOrganizationFilter(Employee, organizationId)
        });

        if (employee) {
            return employee;
        }
    }

    // 2. Fall back to email matching.
    const email = String(dbUser.email || "")
        .trim()
        .toLowerCase();

    if (!email || !schemaHasPath(Employee, "email")) {
        return null;
    }

    const employee = await Employee.findOne({
        ...getOrganizationFilter(Employee, organizationId),
        email
    }).collation({
        locale: "en",
        strength: 2
    });

    if (!employee) {
        console.warn(
            "No employee profile matched the logged-in user.",
            { userId, organizationId }
        );

        return null;
    }

    // 3. Link the employee to the User only if the field exists.
    if (employeeField) {
        await User.updateOne(
            {
                _id: userId,
                [userOrganizationField]: organizationId
            },
            {
                $set: {
                    [employeeField]: employee._id
                }
            },
            { runValidators: true }
        );
    }

    if (req.session?.user) {
        req.session.user.employee = String(employee._id);
    }

    return employee;
};

// =====================================================
// DATE HELPERS
// =====================================================

const parseDateOnly = (value) => {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return null;
    }

    const [year, month, day] = value.split("-").map(Number);

    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    date.setHours(0, 0, 0, 0);

    return date;
};

const calculateLeaveDays = (fromDate, toDate) => {
    const start = new Date(fromDate);
    const end = new Date(toDate);

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    return (
        Math.floor(
            (end.getTime() - start.getTime()) /
            (24 * 60 * 60 * 1000)
        ) + 1
    );
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
        const status = String(request.status || "")
            .toLowerCase();

        if (Object.prototype.hasOwnProperty.call(
            summary,
            status
        ) && status !== "total") {
            summary[status]++;
        }
    }

    return summary;
};

const getAvailableBalance = (balance) => {
    if (!balance) return 0;

    return (
        Number(balance.allocated || 0) +
        Number(balance.carriedForward || 0) +
        Number(balance.adjustment || 0) -
        Number(balance.used || 0)
    );
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
// GET /leave
// LEAVE DASHBOARD
// =====================================================

exports.getLeaveDashboard = async (req, res) => {
    try {
        const organizationId = requireOrganization(req, res);

        if (!organizationId) return;

        const employee = await getCurrentEmployee(req);
        const currentYear = new Date().getFullYear();

        const leaveTypes = await findActiveLeaveTypes(
            organizationId
        );

        let balances = [];
        let requests = [];

        if (employee) {
            balances = await LeaveBalance.find({
                ...getOrganizationFilter(
                    LeaveBalance,
                    organizationId
                ),
                [getEmployeeField(LeaveBalance)]: employee._id,
                year: currentYear
            }).populate("leaveType", "name code isPaid");

            requests = await LeaveRequest.find({
                ...getOrganizationFilter(
                    LeaveRequest,
                    organizationId
                ),
                [getEmployeeField(LeaveRequest)]: employee._id
            })
                .populate("leaveType", "name code isPaid")
                .sort({ createdAt: -1 });
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
        console.error("Leave dashboard error:", error);

        return res.status(500).send(
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
        console.error("Apply leave page error:", error);

        return res.status(500).send(
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

        const employeeField = getEmployeeField(LeaveRequest);

        if (!employeeField) {
            throw new Error(
                "LeaveRequest schema has no employee reference."
            );
        }

        const requestOrganizationFilter =
            getOrganizationFilter(LeaveRequest, organizationId);

        const overlappingRequest = await LeaveRequest.findOne({
            ...requestOrganizationFilter,
            [employeeField]: employee._id,
            status: {
                $in: ["Pending", "Approved"]
            },
            fromDate: { $lte: end },
            toDate: { $gte: start }
        });

        if (overlappingRequest) {
            return res.status(400).send(
                "You already have a pending or approved leave request for these dates."
            );
        }

        const currentYear = start.getFullYear();

        // Leave requests spanning multiple calendar years need
        // a year-by-year balance policy. Do not silently charge
        // the entire request to the starting year.
        if (end.getFullYear() !== currentYear) {
            return res.status(400).send(
                "Please submit separate leave requests for different calendar years."
            );
        }

        if (selectedLeaveType.isPaid) {
            const balanceEmployeeField =
                getEmployeeField(LeaveBalance);

            const balance = await LeaveBalance.findOne({
                ...getOrganizationFilter(
                    LeaveBalance,
                    organizationId
                ),
                [balanceEmployeeField]: employee._id,
                leaveType: selectedLeaveType._id,
                year: currentYear
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
            ...requestOrganizationFilter,
            [employeeField]: employee._id,
            leaveType: selectedLeaveType._id,
            fromDate: start,
            toDate: end,
            totalDays,
            reason: reason.trim(),
            status: "Pending"
        });

        return res.redirect("/leave/my");
    } catch (error) {
        console.error("Apply leave error:", error);

        return res.status(500).send(
            "Unable to submit your leave request."
        );
    }
};


/**
 * GET /leave/my
 * Display the logged-in employee's leave history and balances.
 */
exports.getMyLeaves = async (req, res) => {
    try {
        const organizationId = requireOrganization(req, res);

        if (!organizationId) return;

        const employee = await getEmployeeForRequest(req, res);

        if (!employee) return;

        const employeeField = getEmployeeField(LeaveRequest);

        const requests = await LeaveRequest.find({
            ...getOrganizationFilter(
                LeaveRequest,
                organizationId
            ),
            [employeeField]: employee._id
        })
            .populate("leaveType", "name code isPaid")
            .sort({ createdAt: -1 })
            .lean();

        // Pass the existing requests using the variable names
        // expected by views/leave/my-leaves.ejs.
        return res.render("leave/my-leaves", {
            title: "My Leaves",
            user: getSessionUser(req),
            employee,

            // EJS page expects "leaves", not just "requests".
            leaves: requests,
            requests,

            // Prevent EJS from crashing while the actual balance
            // query/model fields are being confirmed.
            leaveBalances: [],

            summary: getLeaveSummary(requests),
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error("My leaves error:", error);

        return res.status(500).send(
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

        const allowedStatuses = [
            ...LEAVE_STATUSES,
            "All"
        ];

        const requestedStatus = String(
            req.query.status || "Pending"
        );

        const status = allowedStatuses.includes(requestedStatus)
            ? requestedStatus
            : "Pending";

        const query = getOrganizationFilter(
            LeaveRequest,
            organizationId
        );

        if (status !== "All") {
            query.status = status;
        }

        const requests = await LeaveRequest.find(query)
            .populate(
                "employee",
                "firstName lastName employeeId email"
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
        console.error("All leave requests error:", error);

        return res.status(500).send(
            "Unable to load leave requests."
        );
    }
};

// =====================================================
// POST /leave/requests/:id/approve
// =====================================================

exports.approveLeave = async (req, res) => {
    try {
        const organizationId = requireOrganization(req, res);

        if (!organizationId) return;

        const requestId = String(req.params.id || "");

        if (!isValidObjectId(requestId)) {
            return res.status(400).send(
                "Invalid leave request ID."
            );
        }

        const request = await LeaveRequest.findOne({
            _id: requestId,
            ...getOrganizationFilter(
                LeaveRequest,
                organizationId
            ),
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

        const requestedDays = Number(request.totalDays || 0);

        if (!Number.isFinite(requestedDays) || requestedDays <= 0) {
            return res.status(400).send(
                "The requested leave duration is invalid."
            );
        }

        if (request.leaveType.isPaid) {
            const currentYear = new Date(
                request.fromDate
            ).getFullYear();

            const balanceEmployeeField =
                getEmployeeField(LeaveBalance);

            const balance = await LeaveBalance.findOne({
                ...getOrganizationFilter(
                    LeaveBalance,
                    organizationId
                ),
                [balanceEmployeeField]: request.employee,
                leaveType: request.leaveType._id,
                year: currentYear
            });

            if (!balance) {
                return res.status(400).send(
                    "Leave balance not found for this employee."
                );
            }

            const available = getAvailableBalance(balance);

            if (requestedDays > available) {
                return res.status(400).send(
                    `Insufficient leave balance. Available: ${available} day(s).`
                );
            }

            balance.used =
                Number(balance.used || 0) + requestedDays;

            await balance.save();
        }

        request.status = "Approved";

        if (schemaHasPath(LeaveRequest, "reviewedBy")) {
            request.reviewedBy = getUserId(req);
        }

        if (schemaHasPath(LeaveRequest, "reviewedAt")) {
            request.reviewedAt = new Date();
        }

        await request.save();

        return res.redirect("/leave/requests");
    } catch (error) {
        console.error("Approve leave error:", error);

        return res.status(500).send(
            "Unable to approve the leave request."
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

        const request = await LeaveRequest.findOne({
            _id: requestId,
            ...getOrganizationFilter(
                LeaveRequest,
                organizationId
            ),
            status: "Pending"
        });

        if (!request) {
            return res.status(404).send(
                "Pending leave request not found."
            );
        }

        const remark =
            typeof req.body?.remark === "string"
                ? req.body.remark.trim()
                : "";

        request.status = "Rejected";

        if (schemaHasPath(LeaveRequest, "reviewedBy")) {
            request.reviewedBy = getUserId(req);
        }

        if (schemaHasPath(LeaveRequest, "reviewedAt")) {
            request.reviewedAt = new Date();
        }

        if (schemaHasPath(LeaveRequest, "reviewRemark")) {
            request.reviewRemark = remark;
        }

        await request.save();

        return res.redirect("/leave/requests");
    } catch (error) {
        console.error("Reject leave error:", error);

        return res.status(500).send(
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

        const employeeField = getEmployeeField(LeaveRequest);

        const request = await LeaveRequest.findOne({
            _id: requestId,
            ...getOrganizationFilter(
                LeaveRequest,
                organizationId
            ),
            [employeeField]: employee._id,
            status: "Pending"
        });

        if (!request) {
            return res.status(404).send(
                "Pending leave request not found or you are not allowed to cancel it."
            );
        }

        request.status = "Cancelled";

        await request.save();

        return res.redirect("/leave/my");
    } catch (error) {
        console.error("Cancel leave error:", error);

        return res.status(500).send(
            "Unable to cancel the leave request."
        );
    }
};
