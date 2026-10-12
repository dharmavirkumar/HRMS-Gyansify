
"use strict";

const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

// =====================================================
// MODELS
// =====================================================

const Employee = require("../models/Employee");
const Attendance = require("../models/Attendance");
const LeaveRequest = require("../models/LeaveRequest");
const LeaveBalance = require("../models/LeaveBalance");

const { requireAuth } = require("../middleware/authMiddleware");

// =====================================================
// CONSTANTS
// =====================================================

const TIME_ZONE = "Asia/Kolkata";

const ACTIVE_EMPLOYEE_STATUSES = [
    "Active",
    "On Leave",
    "Notice Period",
    "Suspended"
];

const PRESENT_STATUSES = [
    "Present",
    "Late",
    "Half Day"
];

const PENDING_STATUSES = [
    "Pending",
    "PENDING",
    "pending"
];

const APPROVED_STATUSES = [
    "Approved",
    "APPROVED",
    "approved"
];

const DASHBOARD_VIEWS = {
    SUPER_ADMIN: "dashboard/admin",
    HR_ADMIN: "dashboard/hr",
    HR_EXECUTIVE: "dashboard/hr",
    MANAGER: "dashboard/manager",
    EMPLOYEE: "dashboard/employee"
};

// =====================================================
// DATE HELPERS
// =====================================================

function getTodayDate() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());

    const values = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    }

    return `${values.year}-${values.month}-${values.day}`;
}

function getIndiaDayRange(dateString = getTodayDate()) {
    const [year, month, day] = dateString.split("-").map(Number);

    const start = new Date(
        Date.UTC(year, month - 1, day) - (5 * 60 + 30) * 60 * 1000
    );

    const end = new Date(
        start.getTime() + 24 * 60 * 60 * 1000
    );

    return { $gte: start, $lt: end };
}

function getCurrentMonthStart() {
    const today = getTodayDate();
    const [year, month] = today.split("-").map(Number);

    return `${year}-${String(month).padStart(2, "0")}-01`;
}

// =====================================================
// GENERAL HELPERS
// =====================================================

function getId(value) {
    if (!value) return null;

    if (typeof value === "object" && value._id) {
        return value._id;
    }

    return value;
}

function isValidObjectId(value) {
    return Boolean(
        value && mongoose.Types.ObjectId.isValid(String(value))
    );
}

function getOrganizationId(user) {
    return getId(
        user?.organizationId ||
        user?.organization ||
        user?.organizationID
    );
}

function getEmployeeId(user) {
    return getId(
        user?.employeeId ||
        user?.employee
    );
}

function getUserRoles(user) {
    const roles = [];

    if (user?.role) {
        if (typeof user.role === "string") {
            roles.push(user.role);
        } else if (typeof user.role === "object") {
            roles.push(user.role.code, user.role.name);
        }
    }

    if (Array.isArray(user?.roles)) {
        for (const role of user.roles) {
            if (typeof role === "string") {
                roles.push(role);
            } else if (role && typeof role === "object") {
                roles.push(role.code, role.name);
            }
        }
    }

    return [
        ...new Set(
            roles
                .filter(Boolean)
                .map(role =>
                    String(role).trim().toUpperCase().replace(/[\s-]+/g, "_")
                )
        )
    ];
}

function getPrimaryRole(user) {
    const roles = getUserRoles(user);

    const priority = [
        "SUPER_ADMIN",
        "HR_ADMIN",
        "HR_EXECUTIVE",
        "MANAGER",
        "EMPLOYEE"
    ];

    return priority.find(role => roles.includes(role)) || null;
}

function getDashboardView(role) {
    return DASHBOARD_VIEWS[role] || null;
}

function getDefaultStats() {
    return {
        totalEmployees: 0,
        presentToday: 0,
        onLeave: 0,
        absentToday: 0,
        attendancePercentage: 0,
        employeeGrowth: 0,
        pendingLeaves: 0,
        approvedLeaves: 0,
        rejectedLeaves: 0,
        cancelledLeaves: 0,
        pendingRegularization: 0,
        pendingDocuments: 0,
        leaveBalance: 0,
        attendance: 0,
        pendingRequests: 0
    };
}

function getModelPath(Model, candidates) {
    if (!Model?.schema) return null;

    return candidates.find(path =>
        Boolean(Model.schema.path(path))
    ) || null;
}

function getOrganizationPath(Model) {
    return getModelPath(Model, [
        "organization",
        "organizationId",
        "organizationID"
    ]);
}

function getEmployeePath(Model) {
    return getModelPath(Model, [
        "employee",
        "employeeId"
    ]);
}

function getDatePath(Model) {
    return getModelPath(Model, [
        "date",
        "attendanceDate",
        "workDate"
    ]);
}

function getStatusPath(Model) {
    return getModelPath(Model, [
        "status",
        "leaveStatus",
        "approvalStatus",
        "requestStatus"
    ]);
}

function getStatusQuery(Model, statuses) {
    const statusPath = getStatusPath(Model);

    if (!statusPath) return null;

    return {
        [statusPath]: {
            $in: statuses
        }
    };
}

function combineFilters(...filters) {
    return {
        $and: filters.filter(Boolean)
    };
}

function getAttendanceDateFilter() {
    const datePath = getDatePath(Attendance);

    if (!datePath) return null;

    const schemaPath = Attendance.schema.path(datePath);

    if (schemaPath?.instance === "Date") {
        return {
            [datePath]: getIndiaDayRange()
        };
    }

    return {
        [datePath]: getTodayDate()
    };
}

function getLeaveDateFields(Model) {
    const startPath = getModelPath(Model, [
        "fromDate",
        "startDate",
        "start"
    ]);

    const endPath = getModelPath(Model, [
        "toDate",
        "endDate",
        "end"
    ]);

    return { startPath, endPath };
}

function getLeaveOverlapFilter(Model) {
    const { startPath, endPath } = getLeaveDateFields(Model);

    if (!startPath || !endPath) return null;

    const today = getTodayDate();

    return {
        [startPath]: { $lte: today },
        [endPath]: { $gte: today }
    };
}

function safePopulate(query, Model, path, select) {
    if (path && Model.schema.path(path)) {
        return query.populate(path, select);
    }

    return query;
}

function isEmployeePresent(record) {
    return PRESENT_STATUSES.includes(
        String(record?.status || "").trim()
    );
}

function getAttendancePercentage(records) {
    if (!Array.isArray(records) || records.length === 0) {
        return 0;
    }

    const presentDays = records.filter(isEmployeePresent).length;

    return Math.round((presentDays / records.length) * 100);
}

function getEmployeeName(employee) {
    if (!employee) return "Employee";

    return [
        employee.firstName,
        employee.lastName
    ].filter(Boolean).join(" ") || employee.name || "Employee";
}

function getLeaveBalanceValue(balance) {
    const remaining =
        balance?.available ??
        balance?.remaining ??
        balance?.balance ??
        balance?.remainingDays;

    if (Number.isFinite(Number(remaining))) {
        return Number(remaining);
    }

    const allocated = Number(
        balance?.allocated ??
        balance?.totalAllocated ??
        balance?.totalDays ??
        0
    );

    const used = Number(
        balance?.used ??
        balance?.taken ??
        balance?.usedDays ??
        0
    );

    return Math.max(allocated - used, 0);
}

function renderAccessDenied(res, user, title = "Access Denied") {
    return res.status(403).render("errors/403", {
        title,
        user
    });
}

// =====================================================
// ATTENDANCE HELPERS
// =====================================================

async function getTodayAttendance(employeeId) {
    const employeePath = getEmployeePath(Attendance);
    const dateFilter = getAttendanceDateFilter();

    if (!employeePath || !dateFilter) {
        return null;
    }

    return Attendance.findOne({
        [employeePath]: employeeId,
        ...dateFilter
    }).lean();
}

async function getEmployeeAttendancePercentage(employeeId) {
    const employeePath = getEmployeePath(Attendance);
    const datePath = getDatePath(Attendance);

    if (!employeePath || !datePath) return 0;

    const schemaPath = Attendance.schema.path(datePath);
    const monthStart = getCurrentMonthStart();
    const today = getTodayDate();

    let dateFilter;

    if (schemaPath?.instance === "Date") {
        dateFilter = {
            [datePath]: {
                $gte: getIndiaDayRange(monthStart).$gte,
                $lt: getIndiaDayRange(today).$lt
            }
        };
    } else {
        dateFilter = {
            [datePath]: {
                $gte: monthStart,
                $lte: today
            }
        };
    }

    const records = await Attendance.find({
        [employeePath]: employeeId,
        ...dateFilter
    })
        .select("status")
        .lean();

    return getAttendancePercentage(records);
}

// =====================================================
// LEAVE HELPERS
// =====================================================

async function getLeaveBalances(organizationId, employeeId) {
    const organizationPath = getOrganizationPath(LeaveBalance);
    const employeePath = getEmployeePath(LeaveBalance);

    if (!employeePath) return [];

    const filters = [
        { [employeePath]: employeeId }
    ];

    if (organizationPath) {
        filters.push({
            [organizationPath]: organizationId
        });
    }

    let query = LeaveBalance.find(combineFilters(...filters));

    query = safePopulate(
        query,
        LeaveBalance,
        "leaveType",
        "name code"
    );

    return query.lean();
}

async function getEmployeeLeaveRequests(organizationId, employeeId) {
    const organizationPath = getOrganizationPath(LeaveRequest);
    const employeePath = getEmployeePath(LeaveRequest);

    if (!employeePath) return [];

    const filters = [
        { [employeePath]: employeeId }
    ];

    if (organizationPath) {
        filters.push({
            [organizationPath]: organizationId
        });
    }

    let query = LeaveRequest.find(combineFilters(...filters));

    query = safePopulate(
        query,
        LeaveRequest,
        "leaveType",
        "name code"
    );

    return query
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
}

// =====================================================
// DASHBOARD ROUTE
// =====================================================

router.get("/", requireAuth, async (req, res) => {
    const user = req.session?.user || null;

    try {
        if (!user) {
            return res.redirect("/login");
        }

        const role = getPrimaryRole(user);
        const view = getDashboardView(role);

        // Never silently grant access to an unknown role.
        if (!view) {
            return renderAccessDenied(res, user);
        }

        const organizationId = getOrganizationId(user);

        if (!isValidObjectId(organizationId)) {
            return renderAccessDenied(
                res,
                user,
                "Organization Access Required"
            );
        }

        const stats = getDefaultStats();

        const data = {
            title: "Dashboard",
            user,
            stats,
            employee: null,
            attendance: {},
            todayAttendance: null,
            leaveBalances: [],
            leaveRequests: [],
            recentEmployees: [],
            pendingLeavesList: [],
            pendingRequests: [],
            myApprovedLeaves: [],
            dashboardNotice: null,
            today: getTodayDate()
        };

        // =================================================
        // HR ADMIN / HR EXECUTIVE / SUPER ADMIN
        // =================================================

        if (
            ["SUPER_ADMIN", "HR_ADMIN", "HR_EXECUTIVE"].includes(role)
        ) {
            const activeEmployeeFilter = {
                organization: organizationId,
                status: { $ne: "Exited" }
            };

            const [
                totalEmployees,
                recentEmployees,
                employeeIds,
                pendingLeaves,
                pendingLeavesList,
                employeesOnLeave
            ] = await Promise.all([
                Employee.countDocuments(activeEmployeeFilter),

                Employee.find(activeEmployeeFilter)
                    .select(
                        "_id firstName lastName employeeId email department designation status joiningDate"
                    )
                    .populate("department", "name")
                    .populate("designation", "name")
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .lean(),

                Employee.find({
                    organization: organizationId,
                    status: { $ne: "Exited" }
                }).distinct("_id"),

                LeaveRequest.countDocuments(
                    combineFilters(
                        {
                            [getOrganizationPath(LeaveRequest) || "organization"]:
                                organizationId
                        },
                        getStatusQuery(LeaveRequest, PENDING_STATUSES)
                    )
                ),

                (async () => {
                    const organizationPath =
                        getOrganizationPath(LeaveRequest);

                    const statusQuery = getStatusQuery(
                        LeaveRequest,
                        PENDING_STATUSES
                    );

                    if (!organizationPath || !statusQuery) return [];

                    let query = LeaveRequest.find(
                        combineFilters(
                            { [organizationPath]: organizationId },
                            statusQuery
                        )
                    );

                    query = safePopulate(
                        query,
                        LeaveRequest,
                        "employee",
                        "firstName lastName employeeId"
                    );

                    query = safePopulate(
                        query,
                        LeaveRequest,
                        "leaveType",
                        "name code"
                    );

                    return query
                        .sort({ createdAt: -1 })
                        .limit(5)
                        .lean();
                })(),

                Employee.countDocuments({
                    organization: organizationId,
                    status: "On Leave"
                })
            ]);

            const attendanceEmployeePath =
                getEmployeePath(Attendance);

            const attendanceDateFilter =
                getAttendanceDateFilter();

            const attendanceRecords =
                employeeIds.length &&
                attendanceEmployeePath &&
                attendanceDateFilter
                    ? await Attendance.find({
                        [attendanceEmployeePath]: {
                            $in: employeeIds
                        },
                        ...attendanceDateFilter
                    })
                        .select("employee status")
                        .lean()
                    : [];

            const presentToday = attendanceRecords.filter(
                isEmployeePresent
            ).length;

            const leaveStatusQuery = getStatusQuery(
                LeaveRequest,
                APPROVED_STATUSES
            );

            const leaveDateFilter = getLeaveOverlapFilter(
                LeaveRequest
            );

            const leaveOrganizationPath =
                getOrganizationPath(LeaveRequest);

            const approvedLeavesToday =
                leaveStatusQuery &&
                leaveDateFilter &&
                leaveOrganizationPath
                    ? await LeaveRequest.countDocuments(
                        combineFilters(
                            { [leaveOrganizationPath]: organizationId },
                            leaveStatusQuery,
                            leaveDateFilter
                        )
                    )
                    : 0;

            const onLeave = Math.min(
                totalEmployees,
                Math.max(employeesOnLeave, approvedLeavesToday)
            );

            const absentToday = Math.max(
                totalEmployees - presentToday - onLeave,
                0
            );

            stats.totalEmployees = totalEmployees;
            stats.presentToday = presentToday;
            stats.onLeave = onLeave;
            stats.absentToday = absentToday;

            stats.attendancePercentage = totalEmployees
                ? Math.min(
                    100,
                    Math.round((presentToday / totalEmployees) * 100)
                )
                : 0;

            stats.pendingLeaves = pendingLeaves;

            data.recentEmployees = recentEmployees;
            data.pendingLeavesList = pendingLeavesList;
            data.pendingRequests = pendingLeavesList;

            return res.render(view, data);
        }

        // =================================================
        // EMPLOYEE PERSONAL DASHBOARD
        // =================================================

        if (role === "EMPLOYEE") {
            const linkedEmployeeId = getEmployeeId(user);

            if (!isValidObjectId(linkedEmployeeId)) {
                data.dashboardNotice =
                    "Your employee profile is not linked to your login. Please contact HR.";

                return res.render(view, data);
            }

            const employee = await Employee.findOne({
                _id: linkedEmployeeId,
                organization: organizationId
            })
                .populate("department", "name")
                .populate("designation", "name")
                .lean();

            if (!employee) {
                return renderAccessDenied(res, user);
            }

            const employeeId = employee._id;

            const [
                todayAttendance,
                leaveBalances,
                leaveRequests,
                attendancePercentage
            ] = await Promise.all([
                getTodayAttendance(employeeId).catch(error => {
                    console.error("Today's attendance lookup failed:", error.message);
                    return null;
                }),

                getLeaveBalances(organizationId, employeeId).catch(error => {
                    console.error("Leave balance lookup failed:", error.message);
                    return [];
                }),

                getEmployeeLeaveRequests(
                    organizationId,
                    employeeId
                ).catch(error => {
                    console.error("Employee leave request lookup failed:", error.message);
                    return [];
                }),

                getEmployeeAttendancePercentage(employeeId).catch(error => {
                    console.error("Attendance percentage lookup failed:", error.message);
                    return 0;
                })
            ]);

            const pendingLeaves = leaveRequests.filter(request =>
                PENDING_STATUSES.includes(
                    String(
                        request.status ||
                        request.leaveStatus ||
                        request.approvalStatus ||
                        request.requestStatus ||
                        ""
                    )
                )
            );

            const approvedLeaves = leaveRequests.filter(request =>
                APPROVED_STATUSES.includes(
                    String(
                        request.status ||
                        request.leaveStatus ||
                        request.approvalStatus ||
                        request.requestStatus ||
                        ""
                    )
                )
            );

            const totalLeaveBalance = leaveBalances.reduce(
                (total, balance) => total + getLeaveBalanceValue(balance),
                0
            );

            const attendanceStatus = todayAttendance?.status || "Not Marked";

            stats.totalEmployees = 1;
            stats.presentToday = isEmployeePresent(todayAttendance) ? 1 : 0;
            stats.onLeave = approvedLeaves.some(request => {
                const { startPath, endPath } =
                    getLeaveDateFields(LeaveRequest);

                if (!startPath || !endPath) return false;

                const today = getTodayDate();

                return (
                    String(request[startPath] || "").slice(0, 10) <= today &&
                    String(request[endPath] || "").slice(0, 10) >= today
                );
            }) ? 1 : 0;

            stats.absentToday =
                !todayAttendance && stats.onLeave === 0 ? 1 : 0;

            stats.attendancePercentage = attendancePercentage;
            stats.attendance = attendancePercentage;
            stats.pendingLeaves = pendingLeaves.length;
            stats.approvedLeaves = approvedLeaves.length;
            stats.leaveBalance = totalLeaveBalance;
            stats.pendingRequests = pendingLeaves.length;

            data.employee = employee;
            data.attendance = {
                ...(todayAttendance || {}),
                status: attendanceStatus,
                percentage: attendancePercentage
            };
            data.todayAttendance = todayAttendance;
            data.leaveBalances = leaveBalances;
            data.leaveRequests = leaveRequests;
            data.myApprovedLeaves = approvedLeaves;

            return res.render(view, data);
        }

        // =================================================
        // MANAGER DASHBOARD
        // =================================================

        if (role === "MANAGER") {
            const linkedEmployeeId = getEmployeeId(user);

            if (isValidObjectId(linkedEmployeeId)) {
                const managerEmployee = await Employee.findOne({
                    _id: linkedEmployeeId,
                    organization: organizationId
                })
                    .populate("department", "name")
                    .populate("designation", "name")
                    .lean();

                if (!managerEmployee) {
                    return renderAccessDenied(res, user);
                }

                data.employee = managerEmployee;
            }

            data.dashboardNotice =
                "Team dashboard data will be enabled after reporting-manager records are standardized.";

            return res.render(view, data);
        }

        return renderAccessDenied(res, user);

    } catch (error) {
        console.error("Dashboard error:", error);

        return res.status(500).render("errors/500", {
            title: "Dashboard Error",
            user
        });
    }
});

module.exports = router;
