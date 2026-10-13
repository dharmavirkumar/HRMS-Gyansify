
const express = require("express");

const router = express.Router();

const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const Employee = require("../models/Employee");
const Department = require("../models/Department");
const Designation = require("../models/Designation");
const {
    requireAuth
} = require("../middleware/authMiddleware");

const LeaveRequest = require("../models/LeaveRequest");

// =====================================================
// HELPERS
// =====================================================

const getUser = (req) => req.session?.user || null;

const getOrganizationId = (req) => {
    const user = getUser(req);

    return user?.organizationId || user?.organization || null;
};

const sendServerError = (res, message) => {
    return res.status(500).send(message);
};

const ALLOWED_STATUSES = [
    "Pending",
    "Approved",
    "Rejected",
    "Cancelled"
];

const getLeaveFilters = (query = {}) => {
    const filters = {};

    const { fromDate, toDate, status, leaveType } = query;

    // Include leave applications overlapping the selected range.
    if (
        fromDate &&
        /^\d{4}-\d{2}-\d{2}$/.test(fromDate) &&
        !Number.isNaN(Date.parse(fromDate))
    ) {
        filters.toDate = {
            $gte: new Date(`${fromDate}T00:00:00.000Z`)
        };
    }

    if (
        toDate &&
        /^\d{4}-\d{2}-\d{2}$/.test(toDate) &&
        !Number.isNaN(Date.parse(toDate))
    ) {
        filters.fromDate = {
            $lte: new Date(`${toDate}T23:59:59.999Z`)
        };
    }

    if (ALLOWED_STATUSES.includes(status)) {
        filters.status = status;
    }

    if (
        typeof leaveType === "string" &&
        mongoose.Types.ObjectId.isValid(leaveType)
    ) {
        filters.leaveType = new mongoose.Types.ObjectId(leaveType);
    }

    return filters;
};

const getEmployeeName = (employee) => {
    if (!employee) return "Employee unavailable";

    if (employee.name) return employee.name;
    if (employee.fullName) return employee.fullName;

    const fullName = [
        employee.firstName,
        employee.middleName,
        employee.lastName
    ].filter(Boolean).join(" ");

    return fullName || employee.employeeCode || "Employee";
};

const getLeaveTypeName = (leaveType) => {
    if (!leaveType) return "Leave type unavailable";

    return (
        leaveType.name ||
        leaveType.title ||
        leaveType.leaveType ||
        leaveType.typeName ||
        "Leave"
    );
};

const getLeaveStats = (records = []) => {
    return {
        total: records.length,

        pending: records.filter(
            item => item.status === "Pending"
        ).length,

        approved: records.filter(
            item => item.status === "Approved"
        ).length,

        rejected: records.filter(
            item => item.status === "Rejected"
        ).length,

        cancelled: records.filter(
            item => item.status === "Cancelled"
        ).length,

        totalDays: records.reduce(
            (total, item) =>
                total + (Number(item.totalDays) || 0),
            0
        )
    };
};

const getLeaveTypes = (records = []) => {
    const types = new Map();

    records.forEach((record) => {
        if (record.leaveType?._id) {
            const id = String(record.leaveType._id);

            types.set(id, {
                _id: record.leaveType._id,
                name: getLeaveTypeName(record.leaveType)
            });
        }
    });

    return Array.from(types.values());
};

const getCsvValue = (value) => {
    const safeValue = String(value ?? "");

    // Prevent spreadsheet formula injection.
    const protectedValue = /^[\s]*[=+\-@]/.test(safeValue)
        ? `'${safeValue}`
        : safeValue;

    return `"${protectedValue.replace(/"/g, '""')}"`;
};

const formatDate = (value) => {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toISOString().slice(0, 10);
};

// =====================================================
// REPORTS DASHBOARD
// GET /reports
// =====================================================

router.get("/", requireAuth, async (req, res) => {
    try {
        return res.render("reports/index", {
            title: "Reports",
            user: getUser(req),

            stats: {
                employees: 0,
                attendance: 0,
                leave: 0,
                payroll: 0,
                recruitment: 0,
                assets: 0
            },

            reports: [
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
                }
            ]
        });
    } catch (error) {
        console.error("Reports Dashboard Error:", error);
        return sendServerError(res, "Unable to load reports dashboard.");
    }
});

// =====================================================
// EMPLOYEE REPORT
// GET /reports/employees
// =====================================================

router.get("/employees", requireAuth, async (req, res) => {
    try {
        return res.render("reports/employees", {
            title: "Employee Report",
            user: getUser(req),
            employees: [],
            query: req.query
        });
    } catch (error) {
        console.error("Employee Report Error:", error);
        return sendServerError(res, "Unable to load employee report.");
    }
});

// =====================================================
// ATTENDANCE REPORT
// GET /reports/attendance
// =====================================================

router.get("/attendance", requireAuth, async (req, res) => {
    try {
        return res.render("reports/attendance", {
            title: "Attendance Report",
            user: getUser(req),
            records: [],
            query: req.query
        });
    } catch (error) {
        console.error("Attendance Report Error:", error);
        return sendServerError(res, "Unable to load attendance report.");
    }
});

// =====================================================
// LEAVE REPORT
// GET /reports/leave
// =====================================================

router.get("/leave", requireAuth, async (req, res) => {
    try {
        const organizationId = getOrganizationId(req);

        if (
            !organizationId ||
            !mongoose.Types.ObjectId.isValid(String(organizationId))
        ) {
            return res.status(403).send(
                "Your session does not contain a valid organization. Please sign in again."
            );
        }

        const records = await LeaveRequest.find({
            organization: organizationId,
            ...getLeaveFilters(req.query)
        })
            .populate("employee")
            .populate("leaveType")
            .sort({ createdAt: -1 })
            .lean();

        const stats = getLeaveStats(records);

        return res.render("reports/leave", {
            title: "Leave Report",
            user: getUser(req),

            // Support common names used by EJS templates.
            records,
            leaveRequests: records,
            leaveRecords: records,

            stats,
            leaveStats: stats,

            leaveTypes: getLeaveTypes(records),

            query: req.query,
            filterQuery: req.query,

            getEmployeeName,
            getLeaveTypeName
        });
    } catch (error) {
        console.error("Leave Report Error:", error);
        return sendServerError(res, "Unable to load leave report.");
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
            req
        });
    } catch (error) {
        console.error("Payroll Report Error:", error);
        return sendServerError(res, "Unable to load payroll report.");
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
            query: req.query
        });
    } catch (error) {
        console.error("Recruitment Report Error:", error);
        return sendServerError(res, "Unable to load recruitment report.");
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
            req
        });
    } catch (error) {
        console.error("Assets Report Error:", error);
        return sendServerError(res, "Unable to load assets report.");
    }
});

// =====================================================
// EXPORT LEAVE REPORT
// GET /reports/leave/export
// Keep this route before any future /leave/:id route.
// =====================================================

router.get("/leave/export", requireAuth, async (req, res) => {
    try {
        const organizationId = getOrganizationId(req);

        if (
            !organizationId ||
            !mongoose.Types.ObjectId.isValid(String(organizationId))
        ) {
            return res.status(403).send(
                "Your session does not contain a valid organization."
            );
        }

        const records = await LeaveRequest.find({
            organization: organizationId,
            ...getLeaveFilters(req.query)
        })
            .populate("employee")
            .populate("leaveType")
            .sort({ createdAt: -1 })
            .lean();

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
            ...records.map(record => [
                getEmployeeName(record.employee),
                getLeaveTypeName(record.leaveType),
                formatDate(record.fromDate),
                formatDate(record.toDate),
                record.totalDays,
                record.status,
                formatDate(record.createdAt),
                record.reason
            ])
        ];

        const csv = "\uFEFF" + rows
            .map(row => row.map(getCsvValue).join(","))
            .join("\r\n");

        res.setHeader(
            "Content-Type",
            "text/csv; charset=utf-8"
        );

        res.setHeader(
            "Content-Disposition",
            'attachment; filename="gyansify-leave-report.csv"'
        );

        return res.send(csv);
    } catch (error) {
        console.error("Leave Report Export Error:", error);
        return sendServerError(res, "Unable to export leave report.");
    }
});



router.get("/organization", requireAuth, async (req, res, next) => {
    try {
        const user = req.session?.user || {};

        const organizationId =
            user.organizationId ||
            user.organization ||
            user.organizationID;

        if (
            !organizationId ||
            !mongoose.Types.ObjectId.isValid(String(organizationId))
        ) {
            return res.status(403).send(
                "Your session does not contain a valid organization. Please sign in again."
            );
        }

        const orgId = new mongoose.Types.ObjectId(
            String(organizationId)
        );

        const [
            organization,
            employees,
            activeEmployees,
            departments,
            designations
        ] = await Promise.all([
            Organization.findById(orgId).lean(),

            Employee.countDocuments({
                organization: orgId,
                status: { $ne: "Exited" }
            }),

            Employee.countDocuments({
                organization: orgId,
                status: "Active"
            }),

            Department.find({
                organization: orgId,
                status: "Active"
            })
                .select("name code status")
                .sort({ name: 1 })
                .lean(),

            Designation.find({
                organization: orgId,
                status: "Active"
            })
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
            user,
            organization,
            totalEmployees: employees,
            activeEmployees,
            departments,
            designations
        });
    } catch (error) {
        console.error("Organization Report Error:", error);
        next(error);
    }
});




/* Performance Report */
router.get("/performance", requireAuth, async (req, res, next) => {
    try {
        return res.render("reports/performance", {
            title: "Performance Report",
            user: req.session?.user || null,
            stats: {
                totalReviews: 0,
                completedReviews: 0,
                pendingReviews: 0,
                averageRating: 0
            },
            performanceReviews: []
        });
    } catch (error) {
        console.error("Performance Report Error:", error);
        next(error);
    }
});


// =====================================================
// OTHER EXPORT ROUTES
// These remain placeholders until their models are wired.
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
