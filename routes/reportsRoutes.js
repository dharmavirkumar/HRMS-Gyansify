
const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

// =====================================================
// MODELS
// =====================================================

const Organization = require("../models/Organization");
const Employee = require("../models/Employee");
const Department = require("../models/Department");
const Designation = require("../models/Designation");
const LeaveRequest = require("../models/LeaveRequest");

const { requireAuth } = require("../middleware/authMiddleware");

// =====================================================
// CONSTANTS
// =====================================================

const ALLOWED_STATUSES = [
    "Pending",
    "Approved",
    "Rejected",
    "Cancelled"
];

const REPORTS = [
    {
        title: "Employee Report",
        description:
            "View employee records, departments and employment information.",
        url: "/reports/employees",
        icon: "👥"
    },
    {
        title: "Attendance Report",
        description:
            "Review daily and monthly employee attendance.",
        url: "/reports/attendance",
        icon: "◷"
    },
    {
        title: "Leave Report",
        description:
            "View leave applications, approvals and balances.",
        url: "/reports/leave",
        icon: "▣"
    },
    {
        title: "Payroll Report",
        description:
            "Review payroll, salaries, deductions and payment status.",
        url: "/reports/payroll",
        icon: "₹"
    },
    {
        title: "Recruitment Report",
        description:
            "Analyze job openings, applications and hiring activity.",
        url: "/reports/recruitment",
        icon: "◫"
    },
    {
        title: "Assets Report",
        description:
            "Track company assets, assignments, availability and maintenance.",
        url: "/reports/assets",
        icon: "▣"
    },
    {
        title: "Organization Report",
        description:
            "Review organization details, departments and designations.",
        url: "/reports/organization",
        icon: "🏢"
    },
    {
        title: "Performance Report",
        description:
            "Review employee performance and appraisal activity.",
        url: "/reports/performance",
        icon: "📈"
    }
];

// =====================================================
// GENERAL HELPERS
// =====================================================

const getUser = (req) => req.session?.user || null;

const getOrganizationId = (req) => {
    const user = getUser(req);

    return (
        user?.organizationId ||
        user?.organization ||
        user?.organizationID ||
        null
    );
};

const isValidObjectId = (value) => {
    return (
        value !== null &&
        value !== undefined &&
        mongoose.Types.ObjectId.isValid(String(value))
    );
};

const getObjectId = (value) => {
    if (!isValidObjectId(value)) {
        return null;
    }

    return new mongoose.Types.ObjectId(String(value));
};

const sendServerError = (res, message) => {
    return res.status(500).send(message);
};

const escapeHtml = (value) => {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
};

const getOrganizationFilter = (Model, organizationId) => {
    const orgId = getObjectId(organizationId);

    if (!orgId) {
        throw new Error("Invalid organization ID.");
    }

    const possibleFields = [
        "organization",
        "organizationId",
        "organizationID"
    ];

    const existingFields = possibleFields.filter((field) =>
        Boolean(Model.schema?.path(field))
    );

    if (!existingFields.length) {
        throw new Error(
            `${Model.modelName} does not define a supported organization field.`
        );
    }

    if (existingFields.length === 1) {
        return {
            [existingFields[0]]: orgId
        };
    }

    return {
        $or: existingFields.map((field) => ({
            [field]: orgId
        }))
    };
};

const combineFilters = (...filters) => {
    const validFilters = filters.filter(
        (filter) =>
            filter &&
            typeof filter === "object" &&
            Object.keys(filter).length > 0
    );

    if (!validFilters.length) {
        return {};
    }

    if (validFilters.length === 1) {
        return validFilters[0];
    }

    return {
        $and: validFilters
    };
};

const requireOrganization = (req, res) => {
    const organizationId = getOrganizationId(req);

    if (!isValidObjectId(organizationId)) {
        res.status(403).send(
            "Your session does not contain a valid organization. Please sign in again."
        );

        return null;
    }

    return getObjectId(organizationId);
};

const normalizeStatus = (value) => {
    return String(value ?? "").trim().toLowerCase();
};

const formatDate = (value) => {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toISOString().slice(0, 10);
};

const parseDate = (value, endOfDay = false) => {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return null;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
    ) {
        return null;
    }

    if (endOfDay) {
        date.setUTCHours(23, 59, 59, 999);
    }

    return date;
};

const getEmployeeName = (employee) => {
    if (!employee) {
        return "Employee unavailable";
    }

    if (typeof employee === "string") {
        return employee;
    }

    if (employee.name) {
        return employee.name;
    }

    if (employee.fullName) {
        return employee.fullName;
    }

    const fullName = [
        employee.firstName,
        employee.middleName,
        employee.lastName
    ]
        .filter(Boolean)
        .join(" ");

    return fullName || employee.employeeCode || "Employee";
};

const getLeaveTypeName = (leaveType) => {
    if (!leaveType) {
        return "Leave type unavailable";
    }

    if (typeof leaveType === "string") {
        return leaveType;
    }

    return (
        leaveType.name ||
        leaveType.title ||
        leaveType.leaveType ||
        leaveType.typeName ||
        "Leave"
    );
};

// =====================================================
// LEAVE FILTERS
// =====================================================

const getLeaveFilters = (query = {}) => {
    const filters = {};

    const fromDate = parseDate(query.fromDate);
    const toDate = parseDate(query.toDate, true);

    // Include requests that overlap the selected date range.
    if (fromDate) {
        filters.toDate = {
            $gte: fromDate
        };
    }

    if (toDate) {
        filters.fromDate = {
            ...(filters.fromDate || {}),
            $lte: toDate
        };
    }

    if (ALLOWED_STATUSES.includes(query.status)) {
        filters.status = query.status;
    }

    if (
        typeof query.leaveType === "string" &&
        isValidObjectId(query.leaveType)
    ) {
        filters.leaveType = getObjectId(query.leaveType);
    }

    return filters;
};

const getLeaveStats = (records = []) => {
    return {
        total: records.length,

        pending: records.filter(
            (item) => item.status === "Pending"
        ).length,

        approved: records.filter(
            (item) => item.status === "Approved"
        ).length,

        rejected: records.filter(
            (item) => item.status === "Rejected"
        ).length,

        cancelled: records.filter(
            (item) => item.status === "Cancelled"
        ).length,

        totalDays: records.reduce(
            (total, item) =>
                total + Math.max(0, Number(item.totalDays) || 0),
            0
        )
    };
};

const getLeaveTypes = (records = []) => {
    const types = new Map();

    records.forEach((record) => {
        const leaveType = record.leaveType;

        if (leaveType?._id) {
            const id = String(leaveType._id);

            types.set(id, {
                _id: leaveType._id,
                name: getLeaveTypeName(leaveType)
            });
        }
    });

    return Array.from(types.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
    );
};

const getCsvValue = (value) => {
    let safeValue = String(value ?? "");

    // Protect spreadsheet users from formula injection.
    if (/^[\s]*[=+\-@]/.test(safeValue)) {
        safeValue = `'${safeValue}`;
    }

    return `"${safeValue.replace(/"/g, '""')}"`;
};

const sendCsv = (res, filename, rows) => {
    const csv =
        "\uFEFF" +
        rows
            .map((row) => row.map(getCsvValue).join(","))
            .join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");

    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
    );

    res.setHeader("Cache-Control", "no-store");

    return res.send(csv);
};

const loadLeaveRecords = async (organizationId, query = {}) => {
    const organizationFilter = getOrganizationFilter(
        LeaveRequest,
        organizationId
    );

    const reportFilters = getLeaveFilters(query);

    return LeaveRequest.find(
        combineFilters(organizationFilter, reportFilters)
    )
        .populate("employee")
        .populate("leaveType")
        .sort({ createdAt: -1, _id: -1 })
        .lean();
};

// =====================================================
// REPORTS DASHBOARD
// GET /reports
// =====================================================

router.get("/", requireAuth, async (req, res) => {
    try {
        const organizationId = requireOrganization(req, res);

        if (!organizationId) {
            return;
        }

        const employeeFilter = getOrganizationFilter(
            Employee,
            organizationId
        );

        const [
            totalEmployees,
            activeEmployees,
            leaveRequests
        ] = await Promise.all([
            Employee.countDocuments(employeeFilter),

            Employee.countDocuments(
                combineFilters(employeeFilter, {
                    status: "Active"
                })
            ),

            LeaveRequest.countDocuments(
                getOrganizationFilter(LeaveRequest, organizationId)
            )
        ]);

        return res.render("reports/index", {
            title: "Reports",
            user: getUser(req),

            stats: {
                employees: totalEmployees,
                activeEmployees,
                attendance: 0,
                leave: leaveRequests,
                payroll: 0,
                recruitment: 0,
                assets: 0
            },

            reports: REPORTS
        });
    } catch (error) {
        console.error("Reports Dashboard Error:", error);

        return sendServerError(
            res,
            "Unable to load reports dashboard."
        );
    }
});

// =====================================================
// EMPLOYEE REPORT
// GET /reports/employees
// =====================================================

router.get("/employees", requireAuth, async (req, res) => {
    try {
        const organizationId = requireOrganization(req, res);

        if (!organizationId) {
            return;
        }

        const organizationFilter = getOrganizationFilter(
            Employee,
            organizationId
        );

        // Employee listing is organization-scoped.
        // Add pagination/search after confirming the Employee schema.
        const employees = await Employee.find(organizationFilter)
            .sort({ createdAt: -1, _id: -1 })
            .limit(1000)
            .lean();

        return res.render("reports/employees", {
            title: "Employee Report",
            user: getUser(req),
            employees,
            query: req.query
        });
    } catch (error) {
        console.error("Employee Report Error:", error);

        return sendServerError(
            res,
            "Unable to load employee report."
        );
    }
});

// =====================================================
// ATTENDANCE REPORT
// GET /reports/attendance
// =====================================================

router.get("/attendance", requireAuth, async (req, res) => {
    try {
        // Attendance model/schema has not been supplied yet.
        // Keep a clear placeholder instead of querying an assumed model.

        return res.render("reports/attendance", {
            title: "Attendance Report",
            user: getUser(req),
            records: [],
            query: req.query,
            stats: {
                total: 0,
                present: 0,
                absent: 0,
                late: 0
            },
            reportConnected: false
        });
    } catch (error) {
        console.error("Attendance Report Error:", error);

        return sendServerError(
            res,
            "Unable to load attendance report."
        );
    }
});

// =====================================================
// LEAVE REPORT
// GET /reports/leave
// =====================================================

router.get("/leave", requireAuth, async (req, res) => {
    try {
        const organizationId = requireOrganization(req, res);

        if (!organizationId) {
            return;
        }

        const records = await loadLeaveRecords(
            organizationId,
            req.query
        );

        const stats = getLeaveStats(records);

        return res.render("reports/leave", {
            title: "Leave Report",
            user: getUser(req),

            records,
            leaveRequests: records,
            leaveRecords: records,

            stats,
            leaveStats: stats,

            leaveTypes: getLeaveTypes(records),

            query: req.query,
            filterQuery: req.query,

            getEmployeeName,
            getLeaveTypeName,

            reportConnected: true
        });
    } catch (error) {
        console.error("Leave Report Error:", error);

        return sendServerError(
            res,
            "Unable to load leave report."
        );
    }
});

// =====================================================
// LEAVE REPORT EXPORT
// GET /reports/leave/export
// Keep before future /leave/:id routes.
// =====================================================

router.get("/leave/export", requireAuth, async (req, res) => {
    try {
        const organizationId = requireOrganization(req, res);

        if (!organizationId) {
            return;
        }

        const records = await loadLeaveRecords(
            organizationId,
            req.query
        );

        const rows = [
            [
                "Employee",
                "Leave Type",
                "From Date",
                "To Date",
                "Total Days",
                "Status",
                "Applied On",
                "Reason"
            ],

            ...records.map((record) => [
                getEmployeeName(record.employee),
                getLeaveTypeName(record.leaveType),
                formatDate(record.fromDate),
                formatDate(record.toDate),
                record.totalDays ?? "",
                record.status ?? "",
                formatDate(record.createdAt),
                record.reason ?? ""
            ])
        ];

        return sendCsv(
            res,
            "gyansify-leave-report.csv",
            rows
        );
    } catch (error) {
        console.error("Leave Report Export Error:", error);

        return sendServerError(
            res,
            "Unable to export leave report."
        );
    }
});

// =====================================================
// PAYROLL REPORT
// GET /reports/payroll
// =====================================================

router.get("/payroll", requireAuth, async (req, res) => {
    try {
        return res.render("reports/payroll", {
            title: "Payroll Report",
            user: getUser(req),

            stats: {
                totalPayroll: 0,
                netPay: 0,
                deductions: 0,
                paid: 0,
                pending: 0
            },

            payrollRecords: [],
            departments: [],
            query: req.query,
            req,
            reportConnected: false
        });
    } catch (error) {
        console.error("Payroll Report Error:", error);

        return sendServerError(
            res,
            "Unable to load payroll report."
        );
    }
});

// =====================================================
// RECRUITMENT REPORT
// GET /reports/recruitment
// =====================================================

router.get("/recruitment", requireAuth, async (req, res) => {
    try {
        return res.render("reports/recruitment", {
            title: "Recruitment Report",
            user: getUser(req),
            records: [],
            query: req.query,
            reportConnected: false
        });
    } catch (error) {
        console.error("Recruitment Report Error:", error);

        return sendServerError(
            res,
            "Unable to load recruitment report."
        );
    }
});

// =====================================================
// ASSETS REPORT
// GET /reports/assets
// =====================================================

router.get("/assets", requireAuth, async (req, res) => {
    try {
        return res.render("reports/assets", {
            title: "Assets Report",
            user: getUser(req),

            stats: {
                totalAssets: 0,
                assignedAssets: 0,
                availableAssets: 0,
                maintenanceAssets: 0
            },

            assets: [],
            query: req.query,
            req,
            reportConnected: false
        });
    } catch (error) {
        console.error("Assets Report Error:", error);

        return sendServerError(
            res,
            "Unable to load assets report."
        );
    }
});

// =====================================================
// ORGANIZATION REPORT
// GET /reports/organization
// =====================================================

router.get("/organization", requireAuth, async (req, res) => {
    try {
        const organizationId = requireOrganization(req, res);

        if (!organizationId) {
            return;
        }

        const [
            organization,
            totalEmployees,
            activeEmployees,
            departments,
            designations
        ] = await Promise.all([
            Organization.findById(organizationId).lean(),

            Employee.countDocuments(
                getOrganizationFilter(Employee, organizationId)
            ),

            Employee.countDocuments(
                combineFilters(
                    getOrganizationFilter(Employee, organizationId),
                    { status: "Active" }
                )
            ),

            Department.find(
                combineFilters(
                    getOrganizationFilter(Department, organizationId),
                    { status: "Active" }
                )
            )
                .select("name code status")
                .sort({ name: 1 })
                .lean(),

            Designation.find(
                combineFilters(
                    getOrganizationFilter(Designation, organizationId),
                    { status: "Active" }
                )
            )
                .select("name code level status")
                .sort({ name: 1 })
                .lean()
        ]);

        if (!organization) {
            return res.status(404).send(
                "Organization not found."
            );
        }

        return res.render("reports/organization", {
            title: "Organization Report",
            user: getUser(req),
            organization,
            totalEmployees,
            activeEmployees,
            departments,
            designations
        });
    } catch (error) {
        console.error("Organization Report Error:", error);

        return sendServerError(
            res,
            "Unable to load organization report."
        );
    }
});

// =====================================================
// PERFORMANCE REPORT
// GET /reports/performance
// =====================================================

router.get("/performance", requireAuth, async (req, res) => {
    try {
        // Performance review model has not been supplied.
        return res.render("reports/performance", {
            title: "Performance Report",
            user: getUser(req),

            stats: {
                totalReviews: 0,
                completedReviews: 0,
                pendingReviews: 0,
                averageRating: 0
            },

            performanceReviews: [],
            reportConnected: false
        });
    } catch (error) {
        console.error("Performance Report Error:", error);

        return sendServerError(
            res,
            "Unable to load performance report."
        );
    }
});

// =====================================================
// EXPORT PLACEHOLDERS
// These return 501 until the relevant models are connected.
// =====================================================

const registerPlaceholderExport = (path, label) => {
    router.get(path, requireAuth, (req, res) => {
        return res.status(501).send(
            `${label} export is not connected to the database yet.`
        );
    });
};

registerPlaceholderExport("/payroll/export", "Payroll");
registerPlaceholderExport("/assets/export", "Assets");
registerPlaceholderExport("/recruitment/export", "Recruitment");
registerPlaceholderExport("/employees/export", "Employee");
registerPlaceholderExport("/attendance/export", "Attendance");

module.exports = router;
