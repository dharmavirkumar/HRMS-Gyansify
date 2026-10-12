
"use strict";

const mongoose = require("mongoose");

const LeaveRequest = require("../models/LeaveRequest");
const LeaveBalance = require("../models/LeaveBalance");
const LeaveType = require("../models/LeaveType");
const Employee = require("../models/Employee");

// =====================================================
// HELPERS
// =====================================================

const getId = (value) => {
    if (!value) return null;

    if (typeof value === "object") {
        value = value._id || value.id;
    }

    if (!value) return null;

    const id = String(value);

    return mongoose.isValidObjectId(id) ? id : null;
};

const getOrganizationId = (req) => {
    const user = req.session?.user;

    return getId(
        user?.organizationId ||
        user?.organizationID ||
        user?.organization
    );
};

const getUserId = (req) => {
    return getId(
        req.session?.user?._id ||
        req.session?.user?.id
    );
};

const getRequestOrganization = (req, res) => {
    const organizationId = getOrganizationId(req);

    if (!organizationId) {
        res.status(400).send(
            "Valid organization is not available in your session. Please log in again."
        );

        return null;
    }

    return organizationId;
};

const isValidId = (id) => Boolean(getId(id));

const parseNonNegativeNumber = (value, fallback = 0) => {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    const number = Number(value);

    return Number.isFinite(number) && number >= 0
        ? number
        : null;
};

const parseYear = (value) => {
    const year = Number(value);

    if (
        !Number.isInteger(year) ||
        year < 2000 ||
        year > 2100
    ) {
        return null;
    }

    return year;
};

const parseDateOnly = (value) => {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return null;
    }

    const [year, month, day] = value.split("-").map(Number);

    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return date;
};

const getRequestStartDate = (request) =>
    request.startDate || request.fromDate || null;

const getRequestEndDate = (request) =>
    request.endDate || request.toDate || null;

const getRequestDays = (request) =>
    Number(request.days ?? request.totalDays ?? 0);

const getRequestYear = (request) => {
    const date = getRequestStartDate(request);

    if (!date) return null;

    const parsed = new Date(date);

    return Number.isNaN(parsed.getTime())
        ? null
        : parsed.getUTCFullYear();
};

const renderError = (res, message, status = 400) =>
    res.status(status).send(message);

const redirectWithMessage = (res, path, key, message) => {
    const separator = path.includes("?") ? "&" : "?";

    return res.redirect(
        `${path}${separator}${key}=${encodeURIComponent(message)}`
    );
};

const parseBoolean = (value, defaultValue = false) => {
    if (value === undefined) return defaultValue;

    return (
        value === true ||
        value === "true" ||
        value === "on" ||
        value === "1"
    );
};

const getAvailableBalance = (balance) => {
    return (
        Number(balance.allocated || 0) +
        Number(balance.carriedForward || 0) +
        Number(balance.adjustment || 0) -
        Number(balance.used || 0)
    );
};

const isActiveEmployee = (employee) =>
    employee && employee.status !== "Exited";

// =====================================================
// LEAVE TYPES - LIST
// GET /leave/admin/types
// =====================================================

exports.getLeaveTypes = async (req, res) => {
    try {
        const organizationId = getRequestOrganization(req, res);
        if (!organizationId) return;

        const leaveTypes = await LeaveType.find({
            organization: organizationId
        }).sort({ name: 1 }).lean();

        return res.render("leave/admin/type", {
            title: "Leave Types",
            user: req.session.user,
            leaveTypes,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error("Get Leave Types Error:", error);

        return res.status(500).send(
            "Unable to load leave types."
        );
    }
};

// =====================================================
// CREATE LEAVE TYPE
// POST /leave/admin/types
// =====================================================

exports.createLeaveType = async (req, res) => {
    try {
        const organizationId = getRequestOrganization(req, res);
        if (!organizationId) return;

        const name = String(req.body.name || "").trim();
        const code = String(req.body.code || "").trim().toUpperCase();
        const description = String(req.body.description || "").trim();

        if (!name || !code) {
            return renderError(
                res,
                "Leave type name and code are required."
            );
        }

        if (name.length > 100 || code.length > 20) {
            return renderError(
                res,
                "Leave type name or code is too long."
            );
        }

        const annualLimit = parseNonNegativeNumber(
            req.body.annualLimit
        );

        const maxCarryForward = parseNonNegativeNumber(
            req.body.maxCarryForward
        );

        if (annualLimit === null || maxCarryForward === null) {
            return renderError(
                res,
                "Leave limits must be valid non-negative numbers."
            );
        }

        const duplicate = await LeaveType.findOne({
            organization: organizationId,
            code
        });

        if (duplicate) {
            return renderError(
                res,
                "This leave type code already exists."
            );
        }

        await LeaveType.create({
            organization: organizationId,
            name,
            code,
            description,
            isPaid: parseBoolean(req.body.isPaid, true),
            annualLimit,
            allowCarryForward: parseBoolean(
                req.body.allowCarryForward
            ),
            maxCarryForward,
            allowHalfDay: parseBoolean(
                req.body.allowHalfDay,
                true
            ),
            requireDocument: parseBoolean(
                req.body.requireDocument
            ),
            status: "Active"
        });

        return redirectWithMessage(
            res,
            "/leave/admin/types",
            "success",
            "Leave type created successfully."
        );
    } catch (error) {
        console.error("Create Leave Type Error:", error);

        if (error.code === 11000) {
            return renderError(
                res,
                "This leave type code already exists."
            );
        }

        return res.status(500).send(
            "Unable to create leave type."
        );
    }
};

// =====================================================
// UPDATE LEAVE TYPE
// POST /leave/admin/types/update/:id
// =====================================================

exports.updateLeaveType = async (req, res) => {
    try {
        const organizationId = getRequestOrganization(req, res);
        if (!organizationId) return;

        const id = getId(req.params.id);

        if (!id) {
            return renderError(res, "Invalid leave type ID.");
        }

        const name = String(req.body.name || "").trim();
        const code = String(req.body.code || "").trim().toUpperCase();
        const description = String(req.body.description || "").trim();

        if (!name || !code) {
            return renderError(
                res,
                "Leave type name and code are required."
            );
        }

        const annualLimit = parseNonNegativeNumber(
            req.body.annualLimit
        );

        const maxCarryForward = parseNonNegativeNumber(
            req.body.maxCarryForward
        );

        if (annualLimit === null || maxCarryForward === null) {
            return renderError(
                res,
                "Leave limits must be valid non-negative numbers."
            );
        }

        const leaveType = await LeaveType.findOne({
            _id: id,
            organization: organizationId
        });

        if (!leaveType) {
            return renderError(res, "Leave type not found.", 404);
        }

        const duplicate = await LeaveType.findOne({
            organization: organizationId,
            code,
            _id: { $ne: id }
        });

        if (duplicate) {
            return renderError(
                res,
                "This leave type code already exists."
            );
        }

        leaveType.name = name;
        leaveType.code = code;
        leaveType.description = description;
        leaveType.isPaid = parseBoolean(req.body.isPaid, true);
        leaveType.annualLimit = annualLimit;
        leaveType.allowCarryForward = parseBoolean(
            req.body.allowCarryForward
        );
        leaveType.maxCarryForward = maxCarryForward;
        leaveType.allowHalfDay = parseBoolean(
            req.body.allowHalfDay,
            true
        );
        leaveType.requireDocument = parseBoolean(
            req.body.requireDocument
        );

        await leaveType.save();

        return redirectWithMessage(
            res,
            "/leave/admin/types",
            "success",
            "Leave type updated successfully."
        );
    } catch (error) {
        console.error("Update Leave Type Error:", error);

        if (error.code === 11000) {
            return renderError(
                res,
                "This leave type code already exists."
            );
        }

        return res.status(500).send(
            "Unable to update leave type."
        );
    }
};

// =====================================================
// ACTIVATE / DEACTIVATE LEAVE TYPE
// POST /leave/admin/types/toggle/:id
// =====================================================

exports.toggleLeaveType = async (req, res) => {
    try {
        const organizationId = getRequestOrganization(req, res);
        if (!organizationId) return;

        const id = getId(req.params.id);

        if (!id) {
            return renderError(res, "Invalid leave type ID.");
        }

        const leaveType = await LeaveType.findOne({
            _id: id,
            organization: organizationId
        });

        if (!leaveType) {
            return renderError(res, "Leave type not found.", 404);
        }

        leaveType.status =
            leaveType.status === "Active"
                ? "Inactive"
                : "Active";

        await leaveType.save();

        return redirectWithMessage(
            res,
            "/leave/admin/types",
            "success",
            `Leave type ${leaveType.status.toLowerCase()} successfully.`
        );
    } catch (error) {
        console.error("Toggle Leave Type Error:", error);

        return res.status(500).send(
            "Unable to change leave type status."
        );
    }
};

// =====================================================
// LEAVE BALANCES - LIST
// GET /leave/admin/balances
// =====================================================

exports.getLeaveBalances = async (req, res) => {
    try {
        const organizationId = getRequestOrganization(req, res);
        if (!organizationId) return;

        const year = req.query.year
            ? parseYear(req.query.year)
            : new Date().getFullYear();

        if (!year) {
            return renderError(res, "Invalid leave year.");
        }

        const [employees, leaveTypes, balances] = await Promise.all([
            Employee.find({
                organization: organizationId,
                status: { $ne: "Exited" }
            })
                .select("employeeId firstName lastName email status")
                .sort({ firstName: 1 }),

            LeaveType.find({
                organization: organizationId
            }).sort({ name: 1 }),

            LeaveBalance.find({
                organization: organizationId,
                year
            })
                .populate(
                    "employee",
                    "employeeId firstName lastName email"
                )
                .populate(
                    "leaveType",
                    "name code isPaid"
                )
                .sort({ createdAt: -1 })
        ]);

        return res.render("leave/admin/balance", {
            title: "Leave Balances",
            user: req.session.user,
            year,
            employees,
            leaveTypes,
            balances,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error("Get Leave Balances Error:", error);

        return res.status(500).send(
            "Unable to load leave balances."
        );
    }
};

// =====================================================
// ASSIGN / UPDATE LEAVE BALANCE
// POST /leave/admin/balances
// =====================================================

exports.assignLeaveBalance = async (req, res) => {
    try {
        const organizationId = getRequestOrganization(req, res);
        if (!organizationId) return;

        const employeeId = getId(req.body.employee);
        const leaveTypeId = getId(req.body.leaveType);
        const year = parseYear(req.body.year);

        const allocated = parseNonNegativeNumber(
            req.body.allocated,
            null
        );

        const carriedForward = parseNonNegativeNumber(
            req.body.carriedForward
        );

        if (
            !employeeId ||
            !leaveTypeId ||
            !year ||
            allocated === null ||
            carriedForward === null
        ) {
            return renderError(
                res,
                "Please enter a valid employee, leave type, year and balance."
            );
        }

        const [employee, leaveType] = await Promise.all([
            Employee.findOne({
                _id: employeeId,
                organization: organizationId,
                status: { $ne: "Exited" }
            }),

            LeaveType.findOne({
                _id: leaveTypeId,
                organization: organizationId,
                status: "Active"
            })
        ]);

        if (!isActiveEmployee(employee)) {
            return renderError(
                res,
                "Employee not found in your organization."
            );
        }

        if (!leaveType) {
            return renderError(
                res,
                "Active leave type not found."
            );
        }

        if (
            carriedForward > 0 &&
            !leaveType.allowCarryForward
        ) {
            return renderError(
                res,
                "Carry forward is not allowed for this leave type."
            );
        }

        if (
            leaveType.allowCarryForward &&
            carriedForward > Number(leaveType.maxCarryForward || 0)
        ) {
            return renderError(
                res,
                `Maximum carry forward is ${leaveType.maxCarryForward} days.`
            );
        }

        await LeaveBalance.findOneAndUpdate(
            {
                organization: organizationId,
                employee: employeeId,
                leaveType: leaveTypeId,
                year
            },
            {
                $set: {
                    allocated,
                    carriedForward,
                    status: "Active"
                },
                $setOnInsert: {
                    organization: organizationId,
                    employee: employeeId,
                    leaveType: leaveTypeId,
                    year,
                    used: 0,
                    adjustment: 0
                }
            },
            {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        );

        return redirectWithMessage(
            res,
            `/leave/admin/balances?year=${year}`,
            "success",
            "Leave balance saved successfully."
        );
    } catch (error) {
        console.error("Assign Leave Balance Error:", error);

        if (error.code === 11000) {
            return res.status(409).send(
                "A balance already exists for this employee, leave type and year. Refresh and try again."
            );
        }

        return res.status(500).send(
            "Unable to save leave balance."
        );
    }
};

// =====================================================
// ALL LEAVE REQUESTS
// GET /leave/admin
// =====================================================

exports.getLeaveRequests = async (req, res) => {
    try {
        const organizationId = getRequestOrganization(req, res);
        if (!organizationId) return;

        const allowedStatuses = [
            "Pending",
            "Approved",
            "Rejected",
            "Cancelled",
            "All"
        ];

        const status = String(req.query.status || "Pending");

        if (!allowedStatuses.includes(status)) {
            return renderError(res, "Invalid leave status.");
        }

        const query = {
            organization: organizationId
        };

        if (status !== "All") {
            query.status = status;
        }

        const [requests, pending, approved, rejected] = await Promise.all([
            LeaveRequest.find(query)
                .populate(
                    "employee",
                    "employeeId firstName lastName email"
                )
                .populate("leaveType", "name code isPaid")
                .populate("actionBy", "name email")
                .sort({ createdAt: -1 }),

            LeaveRequest.countDocuments({
                organization: organizationId,
                status: "Pending"
            }),

            LeaveRequest.countDocuments({
                organization: organizationId,
                status: "Approved"
            }),

            LeaveRequest.countDocuments({
                organization: organizationId,
                status: "Rejected"
            })
        ]);

        return res.render("leave/admin/index", {
            title: "Leave Management",
            user: req.session.user,
            requests,
            status,
            stats: { pending, approved, rejected }
        });
    } catch (error) {
        console.error("Get Leave Requests Error:", error);

        return res.status(500).send(
            "Unable to load leave requests."
        );
    }
};

// =====================================================
// APPROVE LEAVE
// POST /leave/admin/approve/:id
// =====================================================

exports.approveLeave = async (req, res) => {
    try {
        const organizationId = getRequestOrganization(req, res);
        if (!organizationId) return;

        const requestId = getId(req.params.id);

        if (!requestId) {
            return renderError(res, "Invalid leave request ID.");
        }

        const request = await LeaveRequest.findOne({
            _id: requestId,
            organization: organizationId,
            status: "Pending"
        });

        if (!request) {
            return renderError(
                res,
                "Pending leave request not found.",
                404
            );
        }

        const startDate = getRequestStartDate(request);
        const days = getRequestDays(request);
        const year = getRequestYear(request);

        if (
            !startDate ||
            !year ||
            !Number.isFinite(days) ||
            days <= 0
        ) {
            return renderError(
                res,
                "Leave request has invalid dates or duration."
            );
        }

        const leaveType = await LeaveType.findOne({
            _id: request.leaveType,
            organization: organizationId
        });

        if (!leaveType) {
            return renderError(res, "Leave type not found.", 404);
        }

        let balance = null;

        if (leaveType.isPaid) {
            balance = await LeaveBalance.findOne({
                organization: organizationId,
                employee: request.employee,
                leaveType: leaveType._id,
                year,
                status: "Active"
            });

            if (!balance) {
                return renderError(
                    res,
                    "Active leave balance not found for this employee."
                );
            }

            const available = getAvailableBalance(balance);

            if (days > available) {
                return renderError(
                    res,
                    `Insufficient leave balance. Available: ${available} days.`
                );
            }

            balance.used = Number(balance.used || 0) + days;
            await balance.save();
        }

        request.status = "Approved";

        if (request.schema.path("actionBy")) {
            request.actionBy = getUserId(req);
        }

        if (request.schema.path("actionAt")) {
            request.actionAt = new Date();
        }

        if (request.schema.path("actionComment")) {
            request.actionComment =
                String(req.body?.comment || "").trim() ||
                "Leave approved by HR";
        }

        if (request.schema.path("reviewedBy")) {
            request.reviewedBy = getUserId(req);
        }

        if (request.schema.path("reviewedAt")) {
            request.reviewedAt = new Date();
        }

        await request.save();

        return res.redirect("/leave/admin?status=Pending");
    } catch (error) {
        console.error("Approve Leave Error:", error);

        return res.status(500).send(
            "Unable to approve leave."
        );
    }
};

// =====================================================
// REJECT LEAVE
// POST /leave/admin/reject/:id
// =====================================================

exports.rejectLeave = async (req, res) => {
    try {
        const organizationId = getRequestOrganization(req, res);
        if (!organizationId) return;

        const requestId = getId(req.params.id);

        if (!requestId) {
            return renderError(res, "Invalid leave request ID.");
        }

        const request = await LeaveRequest.findOne({
            _id: requestId,
            organization: organizationId,
            status: "Pending"
        });

        if (!request) {
            return renderError(
                res,
                "Pending leave request not found.",
                404
            );
        }

        request.status = "Rejected";

        if (request.schema.path("actionBy")) {
            request.actionBy = getUserId(req);
        }

        if (request.schema.path("actionAt")) {
            request.actionAt = new Date();
        }

        if (request.schema.path("actionComment")) {
            request.actionComment =
                String(req.body?.comment || "").trim() ||
                "Leave rejected by HR";
        }

        if (request.schema.path("reviewedBy")) {
            request.reviewedBy = getUserId(req);
        }

        if (request.schema.path("reviewedAt")) {
            request.reviewedAt = new Date();
        }

        if (request.schema.path("reviewRemark")) {
            request.reviewRemark =
                String(req.body?.comment || "").trim();
        }

        await request.save();

        return res.redirect("/leave/admin?status=Pending");
    } catch (error) {
        console.error("Reject Leave Error:", error);

        return res.status(500).send(
            "Unable to reject leave."
        );
    }
};

// =====================================================
// REVERT APPROVED LEAVE
// POST /leave/admin/revert/:id
// =====================================================

exports.revertApproval = async (req, res) => {
    try {
        const organizationId = getRequestOrganization(req, res);
        if (!organizationId) return;

        const requestId = getId(req.params.id);

        if (!requestId) {
            return renderError(res, "Invalid leave request ID.");
        }

        const request = await LeaveRequest.findOne({
            _id: requestId,
            organization: organizationId,
            status: "Approved"
        });

        if (!request) {
            return renderError(
                res,
                "Approved leave request not found.",
                404
            );
        }

        const leaveType = await LeaveType.findOne({
            _id: request.leaveType,
            organization: organizationId
        });

        const year = getRequestYear(request);
        const days = getRequestDays(request);

        if (!year || !Number.isFinite(days) || days <= 0) {
            return renderError(
                res,
                "Leave request has invalid dates or duration."
            );
        }

        if (leaveType?.isPaid) {
            const balance = await LeaveBalance.findOne({
                organization: organizationId,
                employee: request.employee,
                leaveType: request.leaveType,
                year
            });

            if (!balance) {
                return renderError(
                    res,
                    "Leave balance not found. Approval was not reverted."
                );
            }

            balance.used = Math.max(
                0,
                Number(balance.used || 0) - days
            );

            await balance.save();
        }

        request.status = "Cancelled";

        if (request.schema.path("actionBy")) {
            request.actionBy = getUserId(req);
        }

        if (request.schema.path("actionAt")) {
            request.actionAt = new Date();
        }

        if (request.schema.path("actionComment")) {
            request.actionComment = "Approval reverted by HR";
        }

        if (request.schema.path("reviewedBy")) {
            request.reviewedBy = getUserId(req);
        }

        if (request.schema.path("reviewedAt")) {
            request.reviewedAt = new Date();
        }

        await request.save();

        return res.redirect("/leave/admin");
    } catch (error) {
        console.error("Revert Leave Error:", error);

        return res.status(500).send(
            "Unable to revert leave."
        );
    }
};