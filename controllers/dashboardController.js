
"use strict";

const mongoose = require("mongoose");

const User = require("../models/User");
const Employee = require("../models/Employee");
const LeaveRequest = require("../models/LeaveRequest");
const LeaveBalance = require("../models/LeaveBalance");
const Attendance = require("../models/Attendance");

// =====================================================
// HELPERS
// =====================================================

const getSessionUser = (req) =>
    req.session?.user || null;

const normalizeId = (value) => {
    if (!value) return null;

    if (typeof value === "object" && value._id) {
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
        user?.organization ||
        user?.organizationID
    );
};

const hasPath = (Model, path) =>
    Boolean(Model?.schema?.path(path));

const getFirstPath = (Model, paths) =>
    paths.find((path) => hasPath(Model, path)) || null;

const getOrganizationField = (Model) =>
    getFirstPath(Model, [
        "organization",
        "organizationId",
        "organizationID"
    ]);

const getEmployeeField = (Model) =>
    getFirstPath(Model, [
        "employee",
        "employeeId"
    ]);

const getStatusField = (Model) =>
    getFirstPath(Model, [
        "status",
        "leaveStatus",
        "approvalStatus",
        "requestStatus"
    ]);

const getDateField = (Model) =>
    getFirstPath(Model, [
        "date",
        "attendanceDate",
        "workDate"
    ]);

const getStatusFilter = (Model, status) => {
    const field = getStatusField(Model);

    if (!field) return {};

    return {
        [field]: {
            $in: [
                status,
                status.toLowerCase(),
                status.toUpperCase()
            ]
        }
    };
};

const normalizeRole = (role) => {
    if (typeof role === "string") {
        return role.trim().toUpperCase();
    }

    if (role && typeof role === "object") {
        return String(
            role.code ||
            role.name ||
            role.role ||
            ""
        ).trim().toUpperCase();
    }

    return "";
};

const getUserRoles = (user) => {
    if (!user) return [];

    const roles = [
        ...(user.role ? [user.role] : []),
        ...(Array.isArray(user.roles) ? user.roles : [])
    ];

    return [
        ...new Set(roles.map(normalizeRole).filter(Boolean))
    ];
};

const getPrimaryRole = (user) => {
    const roles = getUserRoles(user);

    const priority = [
        "SUPER_ADMIN",
        "HR_ADMIN",
        "HR_EXECUTIVE",
        "MANAGER",
        "EMPLOYEE"
    ];

    return priority.find((role) => roles.includes(role)) || null;
};

const getTodayString = () =>
    new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());

const getIndiaMonthRange = () => {
    const today = getTodayString();
    const [year, month] = today.split("-").map(Number);

    return {
        start: `${year}-${String(month).padStart(2, "0")}-01`,
        end: today,
        year,
        month
    };
};

const getWorkingDaysThroughToday = () => {
    const { year, month } = getIndiaMonthRange();
    const today = Number(getTodayString().slice(-2));

    let count = 0;

    for (let day = 1; day <= today; day += 1) {
        const date = new Date(Date.UTC(year, month - 1, day));
        const weekday = date.getUTCDay();

        if (weekday !== 0 && weekday !== 6) {
            count += 1;
        }
    }

    return count;
};

// Build a date filter for common String and Date attendance fields.
const getDateRangeFilter = (Model, startDate, endDate) => {
    const field = getDateField(Model);

    if (!field) return null;

    const schemaType = Model.schema.path(field);
    const isDateType = schemaType?.instance === "Date";

    if (isDateType) {
        const start = new Date(`${startDate}T00:00:00+05:30`);
        const end = new Date(`${endDate}T23:59:59.999+05:30`);

        return {
            [field]: {
                $gte: start,
                $lte: end
            }
        };
    }

    return {
        [field]: {
            $gte: startDate,
            $lte: endDate
        }
    };
};

const populateIfExists = (query, Model, path, select) => {
    if (!hasPath(Model, path)) return query;

    return select
        ? query.populate(path, select)
        : query.populate(path);
};

// =====================================================
// CURRENT EMPLOYEE
// Resolve by User employee reference, then email.
// All employee queries are organization-scoped.
// =====================================================

const getCurrentEmployee = async (req, organizationId) => {
    const userId = getUserId(req);
    const sessionUser = getSessionUser(req);

    if (!userId || !mongoose.isValidObjectId(userId)) {
        return null;
    }

    const dbUser = await User.findById(userId).lean();

    if (!dbUser) return null;

    const userOrganizationField = getOrganizationField(User);

    if (!userOrganizationField) {
        throw new Error(
            "User schema has no organization field."
        );
    }

    const dbOrganizationId = normalizeId(
        dbUser[userOrganizationField]
    );

    if (
        !dbOrganizationId ||
        dbOrganizationId !== organizationId
    ) {
        return null;
    }

    const employeeOrganizationField =
        getOrganizationField(Employee);

    if (!employeeOrganizationField) {
        throw new Error(
            "Employee schema has no organization field."
        );
    }

    const userEmployeeField = getFirstPath(User, [
        "employee",
        "employeeId"
    ]);

    if (
        userEmployeeField &&
        dbUser[userEmployeeField]
    ) {
        const linkedId = normalizeId(
            dbUser[userEmployeeField]
        );

        if (linkedId && mongoose.isValidObjectId(linkedId)) {
            const linkedEmployee = await Employee.findOne({
                _id: linkedId,
                [employeeOrganizationField]: organizationId
            })
                .populate("department")
                .populate("designation")
                .lean();

            if (linkedEmployee) {
                return linkedEmployee;
            }
        }
    }

    const email = String(
        dbUser.email || sessionUser.email || ""
    ).trim();

    if (!email || !hasPath(Employee, "email")) {
        return null;
    }

    return Employee.findOne({
        [employeeOrganizationField]: organizationId,
        email: {
            $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            $options: "i"
        }
    })
        .populate("department")
        .populate("designation")
        .lean();
};

// =====================================================
// EMPLOYEE LEAVE REQUESTS
// =====================================================

const getEmployeeLeaveRequests = async (
    organizationId,
    employeeId
) => {
    if (!employeeId) return [];

    const organizationField =
        getOrganizationField(LeaveRequest);

    const employeeField =
        getEmployeeField(LeaveRequest);

    if (!organizationField || !employeeField) {
        console.warn(
            "[Dashboard] LeaveRequest organization/employee field missing."
        );
        return [];
    }

    const filter = {
        [organizationField]: organizationId,
        [employeeField]: employeeId
    };

    let query = LeaveRequest.find(filter)
        .sort({ createdAt: -1 })
        .limit(10);

    query = populateIfExists(
        query,
        LeaveRequest,
        "leaveType",
        "name code"
    );

    return query.lean();
};

// =====================================================
// EMPLOYEE LEAVE BALANCES
// =====================================================

const getEmployeeLeaveBalances = async (
    organizationId,
    employeeId
) => {
    if (!employeeId) return [];

    const organizationField =
        getOrganizationField(LeaveBalance);

    const employeeField =
        getEmployeeField(LeaveBalance);

    if (!employeeField) {
        console.warn(
            "[Dashboard] LeaveBalance has no employee reference."
        );
        return [];
    }

    const filter = {
        [employeeField]: employeeId
    };

    // Some installations may not have organization on the
    // balance document. If present, always scope it.
    if (organizationField) {
        filter[organizationField] = organizationId;
    }

    let query = LeaveBalance.find(filter);

    query = populateIfExists(
        query,
        LeaveBalance,
        "leaveType",
        "name code"
    );

    return query.sort({ createdAt: -1 }).lean();
};

// =====================================================
// TODAY'S EMPLOYEE ATTENDANCE
// =====================================================

const getEmployeeAttendance = async (
    organizationId,
    employeeId
) => {
    const emptyResult = {
        status: "Not Marked",
        checkIn: null,
        checkOut: null,
        percentage: 0
    };

    if (!employeeId) return emptyResult;

    const organizationField =
        getOrganizationField(Attendance);

    const employeeField =
        getEmployeeField(Attendance);

    const dateField = getDateField(Attendance);

    if (!employeeField || !dateField) {
        console.warn(
            "[Dashboard] Attendance schema requires an employee reference and date field."
        );

        return emptyResult;
    }

    const today = getTodayString();
    const monthRange = getIndiaMonthRange();

    const todayFilter = getDateRangeFilter(
        Attendance,
        today,
        today
    );

    const monthFilter = getDateRangeFilter(
        Attendance,
        monthRange.start,
        monthRange.end
    );

    if (!todayFilter || !monthFilter) {
        return emptyResult;
    }

    const baseFilter = {
        [employeeField]: employeeId
    };

    if (organizationField) {
        baseFilter[organizationField] = organizationId;
    }

    const todayRecord = await Attendance.findOne({
        ...baseFilter,
        ...todayFilter
    })
        .sort({ createdAt: -1 })
        .lean();

    const monthRecords = await Attendance.find({
        ...baseFilter,
        ...monthFilter
    }).lean();

    const presentCount = monthRecords.filter((record) => {
        const status = String(
            record.status ||
            record.attendanceStatus ||
            ""
        ).trim().toLowerCase();

        return [
            "present",
            "late",
            "half day",
            "half-day"
        ].includes(status);
    }).length;

    const workingDays = getWorkingDaysThroughToday();

    const percentage = workingDays > 0
        ? Math.min(
            100,
            Math.round((presentCount / workingDays) * 100)
        )
        : 0;

    if (!todayRecord) {
        return {
            ...emptyResult,
            percentage
        };
    }

    return {
        ...todayRecord,
        status:
            todayRecord.status ||
            todayRecord.attendanceStatus ||
            "Present",
        checkIn:
            todayRecord.checkIn ||
            todayRecord.checkInTime ||
            todayRecord.clockIn ||
            null,
        checkOut:
            todayRecord.checkOut ||
            todayRecord.checkOutTime ||
            todayRecord.clockOut ||
            null,
        percentage
    };
};

// =====================================================
// DASHBOARD
// =====================================================

exports.getDashboard = async (req, res) => {
    try {
        const user = getSessionUser(req);

        if (!user) {
            return res.redirect("/login");
        }

        const role = getPrimaryRole(user);

        if (!role) {
            return res.status(403).send(
                "Your account does not have a valid HRMS role."
            );
        }

        const organizationId = getOrganizationId(req);

        console.log("[Gyansify HRMS] Loading dashboard", {
            user: user.email || user._id || user.id,
            role,
            organizationId
        });

        const stats = {
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
            attendance: 0
        };

        let recentEmployees = [];
        let pendingRequests = [];
        let employee = null;
        let attendance = {
            status: "Not Marked",
            checkIn: null,
            checkOut: null,
            percentage: 0
        };
        let leaveBalances = [];
        let leaveRequests = [];

        if (
            !organizationId ||
            !mongoose.isValidObjectId(organizationId)
        ) {
            return res.status(400).send(
                "Organization information is missing or invalid. Please log in again."
            );
        }

        // -------------------------------------------------
        // Organization-scoped employee data
        // -------------------------------------------------

        const employeeOrganizationField =
            getOrganizationField(Employee);

        if (!employeeOrganizationField) {
            throw new Error(
                "Employee schema has no organization field."
            );
        }

        const employeeFilter = {
            [employeeOrganizationField]: organizationId,
            status: { $ne: "Exited" }
        };

        stats.totalEmployees =
            await Employee.countDocuments(employeeFilter);

        recentEmployees = await Employee.find(employeeFilter)
            .populate("department")
            .populate("designation")
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        // -------------------------------------------------
        // Organization-scoped leave statistics
        // -------------------------------------------------

        const leaveOrganizationField =
            getOrganizationField(LeaveRequest);

        if (!leaveOrganizationField) {
            throw new Error(
                "LeaveRequest schema has no organization field."
            );
        }

        const leaveOrgFilter = {
            [leaveOrganizationField]: organizationId
        };

        const countLeaveStatus = (status) =>
            LeaveRequest.countDocuments({
                ...leaveOrgFilter,
                ...getStatusFilter(LeaveRequest, status)
            });

        stats.pendingLeaves = await countLeaveStatus("Pending");
        stats.approvedLeaves = await countLeaveStatus("Approved");
        stats.rejectedLeaves = await countLeaveStatus("Rejected");
        stats.cancelledLeaves = await countLeaveStatus("Cancelled");

        const leaveEmployeeField =
            getEmployeeField(LeaveRequest);

        if (leaveEmployeeField) {
            let pendingQuery = LeaveRequest.find({
                ...leaveOrgFilter,
                ...getStatusFilter(LeaveRequest, "Pending")
            })
                .sort({ createdAt: -1 })
                .limit(10);

            pendingQuery = populateIfExists(
                pendingQuery,
                LeaveRequest,
                leaveEmployeeField,
                "firstName lastName employeeId email"
            );

            pendingQuery = populateIfExists(
                pendingQuery,
                LeaveRequest,
                "leaveType",
                "name code"
            );

            pendingRequests = await pendingQuery.lean();
        }

        // -------------------------------------------------
        // Current employee self-service data
        // -------------------------------------------------

        employee = await getCurrentEmployee(req, organizationId);

        const isEmployeeDashboard = role === "EMPLOYEE";

        if (isEmployeeDashboard) {
            const employeeId = normalizeId(employee?._id);

            if (employeeId) {
                [
                    attendance,
                    leaveBalances,
                    leaveRequests
                ] = await Promise.all([
                    getEmployeeAttendance(
                        organizationId,
                        employeeId
                    ),
                    getEmployeeLeaveBalances(
                        organizationId,
                        employeeId
                    ),
                    getEmployeeLeaveRequests(
                        organizationId,
                        employeeId
                    )
                ]);

                stats.leaveBalance = leaveBalances.reduce(
                    (total, item) => {
                        const directBalance =
                            item.available !== undefined &&
                            item.available !== null
                                ? item.available
                                : item.remaining;

                        if (
                            directBalance !== undefined &&
                            directBalance !== null
                        ) {
                            return total + Number(directBalance || 0);
                        }

                        const allocated =
                            item.allocated !== undefined
                                ? item.allocated
                                : item.totalAllocated;

                        const used =
                            item.used !== undefined
                                ? item.used
                                : item.taken;

                        return total +
                            Number(allocated || 0) +
                            Number(item.carriedForward || 0) +
                            Number(item.adjustment || 0) -
                            Number(used || 0);
                    },
                    0
                );

                stats.attendance = attendance.percentage || 0;
                stats.attendancePercentage = attendance.percentage || 0;

                stats.pendingLeaves = leaveRequests.filter((request) =>
                    ["pending", "submitted", "under review", "awaiting approval"]
                        .includes(
                            String(
                                request.status ||
                                request.leaveStatus ||
                                request.approvalStatus ||
                                request.requestStatus ||
                                ""
                            ).trim().toLowerCase().replace(/[_-]+/g, " ")
                        )
                ).length;

                stats.approvedLeaves = leaveRequests.filter((request) =>
                    ["approved", "approve", "accepted"].includes(
                        String(
                            request.status ||
                            request.leaveStatus ||
                            request.approvalStatus ||
                            request.requestStatus ||
                            ""
                        ).trim().toLowerCase()
                    )
                ).length;
            } else {
                console.warn(
                    "[Dashboard] No employee record found for logged-in employee."
                );
            }
        }

        // -------------------------------------------------
        // Dashboard view selection
        // -------------------------------------------------

        const dashboardViews = {
            SUPER_ADMIN: {
                view: "dashboard/admin",
                title: "Admin Dashboard"
            },
            HR_ADMIN: {
                view: "dashboard/hr",
                title: "HR Dashboard"
            },
            HR_EXECUTIVE: {
                view: "dashboard/hr",
                title: "HR Dashboard"
            },
            MANAGER: {
                view: "dashboard/manager",
                title: "Manager Dashboard"
            },
            EMPLOYEE: {
                view: "dashboard/employee",
                title: "Employee Dashboard"
            }
        };

        const config = dashboardViews[role];

        return res.render(config.view, {
            title: config.title,
            user,
            stats,

            employee,

            attendance,
            leaveBalances,
            leaveRequests,

            recentEmployees: isEmployeeDashboard
                ? []
                : recentEmployees,

            pendingRequests: isEmployeeDashboard
                ? []
                : pendingRequests
        });

    } catch (error) {
        console.error(
            "[Gyansify HRMS] Dashboard error:",
            error.stack || error
        );

        return res.status(500).send(
            "Unable to load dashboard. Please try again later."
        );
    }
};
