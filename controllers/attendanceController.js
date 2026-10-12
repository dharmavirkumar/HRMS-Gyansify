
"use strict";

const mongoose = require("mongoose");

const Attendance = require("../models/Attendance");
const Employee = require("../models/Employee");
const User = require("../models/User");

// =====================================================
// CONFIGURATION
// =====================================================

const TIME_ZONE = "Asia/Kolkata";
const LATE_HOUR = 10;
const LATE_MINUTE = 15;
const STANDARD_WORK_MINUTES = 480;
const HISTORY_LIMIT = 30;

const HR_ROLES = new Set([
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE"
]);

// =====================================================
// DATE HELPERS
// =====================================================

const getTodayDate = () => {
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
};

const getCurrentYearMonth = () => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit"
    }).formatToParts(new Date());

    const values = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    }

    return {
        year: Number(values.year),
        month: values.month
    };
};

const getIndiaTimeParts = () => {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).formatToParts(new Date());

    const values = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            values[part.type] = Number(part.value);
        }
    }

    return values;
};

const isLateCheckIn = () => {
    const { hour, minute } = getIndiaTimeParts();

    return (
        hour > LATE_HOUR ||
        (hour === LATE_HOUR && minute >= LATE_MINUTE)
    );
};

// =====================================================
// AUTHENTICATED USER
// =====================================================

const getSessionUserId = (req) => {
    return (
        req.session?.user?._id ||
        req.session?.user?.id ||
        req.session?.userId ||
        null
    );
};

// =====================================================
// ROLE HELPERS
// Supports role strings and populated Role objects.
// =====================================================

const normalizeRole = (value) => {
    if (!value) return "";

    if (typeof value === "string") {
        return value
            .trim()
            .toUpperCase()
            .replace(/[\s-]+/g, "_");
    }

    if (typeof value === "object") {
        return normalizeRole(
            value.code ||
            value.name ||
            value.role ||
            value.value
        );
    }

    return "";
};

const collectRoleCodes = (user) => {
    if (!user) return [];

    const candidates = [
        user.role,
        user.roles,
        user.roleCode,
        user.permissions
    ];

    const codes = [];

    const collect = (value) => {
        if (!value) return;

        if (Array.isArray(value)) {
            value.forEach(collect);
            return;
        }

        if (typeof value === "object") {
            const code = normalizeRole(value);

            if (code) codes.push(code);

            return;
        }

        const code = normalizeRole(value);

        if (code) codes.push(code);
    };

    candidates.forEach(collect);

    return [...new Set(codes)];
};

const isHRUser = (dbUser, sessionUser) => {
    const roleCodes = [
        ...collectRoleCodes(dbUser),
        ...collectRoleCodes(sessionUser)
    ];

    return roleCodes.some(role => HR_ROLES.has(role));
};

// =====================================================
// REQUEST CONTEXT
// Loads the authenticated user and their organization.
// =====================================================

const getRequestContext = async (req) => {
    const userId = getSessionUserId(req);

    if (!userId || !mongoose.isValidObjectId(userId)) {
        return {
            error: "Authentication required.",
            status: 401
        };
    }

    let userQuery = User.findById(userId).select(
        "name email organization organizationId employee role roles roleCode status"
    );

    // Populate roles only if this path exists in the User schema.
    if (User.schema.path("roles")) {
        userQuery = userQuery.populate({
            path: "roles",
            select: "code name"
        });
    }

    const dbUser = await userQuery.lean();

    if (!dbUser) {
        return {
            error: "User account not found.",
            status: 401
        };
    }

    if (
        dbUser.status &&
        String(dbUser.status).toUpperCase() !== "ACTIVE"
    ) {
        return {
            error: "Your account is not active.",
            status: 403
        };
    }

    const sessionUser = req.session?.user || {};

    const organizationId =
        dbUser.organizationId ||
        dbUser.organization?._id ||
        dbUser.organization ||
        sessionUser.organizationId ||
        sessionUser.organization?._id ||
        sessionUser.organization ||
        req.session?.organizationId ||
        null;

    if (
        !organizationId ||
        !mongoose.isValidObjectId(
            String(organizationId)
        )
    ) {
        return {
            error: "Organization could not be identified.",
            status: 403
        };
    }

    return {
        dbUser,
        sessionUser,
        organizationId: new mongoose.Types.ObjectId(
            String(organizationId)
        ),
        isHR: isHRUser(dbUser, sessionUser)
    };
};

// =====================================================
// FIND THE LOGGED-IN EMPLOYEE
// =====================================================

const getCurrentEmployee = async (
    dbUser,
    organizationId
) => {
    let employee = null;

    const employeeId =
        dbUser.employee?._id ||
        dbUser.employee ||
        null;

    if (
        employeeId &&
        mongoose.isValidObjectId(String(employeeId))
    ) {
        employee = await Employee.findOne({
            _id: employeeId,
            organization: organizationId
        });
    }

    // Fall back to email matching within this organization.
    if (!employee && dbUser.email) {
        employee = await Employee.findOne({
            organization: organizationId,
            email: {
                $regex: `^${String(dbUser.email).replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                )}$`,
                $options: "i"
            }
        });

        // Repair the User-to-Employee relationship when possible.
        if (employee) {
            const update = {
                $set: {
                    employee: employee._id
                }
            };

            const userFilter = {
                _id: dbUser._id
            };

            if (User.schema.path("organization")) {
                userFilter.organization = organizationId;
            } else if (User.schema.path("organizationId")) {
                userFilter.organizationId = organizationId;
            }

            await User.updateOne(userFilter, update);
        }
    }

    return employee;
};

// =====================================================
// COMMON HELPERS
// =====================================================

const sendControllerError = (res, error, status = 500) => {
    return res.status(status).send(error);
};

const getContextOrRespond = async (req, res) => {
    const context = await getRequestContext(req);

    if (context.error) {
        if (context.status === 401) {
            res.redirect("/auth/login");
            return null;
        }

        sendControllerError(
            res,
            context.error,
            context.status
        );

        return null;
    }

    return context;
};

const getActiveEmployees = (organizationId) => {
    return Employee.find({
        organization: organizationId,
        status: { $ne: "Exited" }
    })
        .populate("department", "name")
        .populate("designation", "name")
        .sort({ firstName: 1 });
};

// =====================================================
// TODAY'S ATTENDANCE
// GET /attendance
// HR sees all employees.
// Employees are redirected to their personal page.
// =====================================================

exports.getTodayAttendance = async (req, res) => {
    try {
        const context = await getContextOrRespond(req, res);

        if (!context) return;

        const {
            organizationId,
            isHR,
            sessionUser
        } = context;

        if (!isHR) {
            return res.redirect("/attendance/my");
        }

        const today = getTodayDate();

        const employees = await getActiveEmployees(
            organizationId
        );

        const employeeIds = employees.map(
            employee => employee._id
        );

        const attendance = employeeIds.length
            ? await Attendance.find({
                employee: { $in: employeeIds },
                date: today
            }).populate(
                "employee",
                "firstName lastName employeeId"
            )
            : [];

        const attendanceMap = new Map();

        attendance.forEach(record => {
            if (record.employee) {
                attendanceMap.set(
                    String(record.employee._id),
                    record
                );
            }
        });

        const rows = employees.map(employee => ({
            employee,
            attendance:
                attendanceMap.get(String(employee._id)) || null
        }));

        const present = attendance.filter(
            record => record.status === "Present"
        ).length;

        const late = attendance.filter(
            record => record.status === "Late"
        ).length;

        const halfDay = attendance.filter(
            record => record.status === "Half Day"
        ).length;

        const leave = attendance.filter(
            record => record.status === "Leave"
        ).length;

        const recordedEmployeeIds = new Set(
            attendance
                .filter(record => record.employee)
                .map(record => String(record.employee._id))
        );

        const absent = employees.filter(
            employee =>
                !recordedEmployeeIds.has(String(employee._id))
        ).length;

        return res.render("attendance/index", {
            title: "Today's Attendance",
            user: sessionUser,
            date: today,
            rows,
            stats: {
                total: employees.length,
                present,
                late,
                halfDay,
                leave,
                absent
            }
        });
    } catch (error) {
        console.error("Today Attendance Error:", error);

        return res.status(500).send(
            "Unable to load attendance."
        );
    }
};

// =====================================================
// MY ATTENDANCE
// GET /attendance/my
// Employee sees only their own attendance.
// =====================================================

exports.getMyAttendance = async (req, res) => {
    try {
        const context = await getContextOrRespond(req, res);

        if (!context) return;

        const {
            dbUser,
            organizationId,
            sessionUser
        } = context;

        const employee = await getCurrentEmployee(
            dbUser,
            organizationId
        );

        if (!employee) {
            return res.status(404).send(
                "Employee profile not found. Please contact HR."
            );
        }

        const today = getTodayDate();

        const attendanceRecords = await Attendance.find({
            employee: employee._id
        })
            .sort({ date: -1 })
            .limit(HISTORY_LIMIT)
            .lean();

        const todayAttendance = attendanceRecords.find(
            record => record.date === today
        ) || null;

        const totalWorkMinutes = attendanceRecords.reduce(
            (total, record) =>
                total + (Number(record.workMinutes) || 0),
            0
        );

        const totalOvertimeMinutes = attendanceRecords.reduce(
            (total, record) =>
                total + (Number(record.overtimeMinutes) || 0),
            0
        );

        return res.render("attendance/my", {
            title: "My Attendance",
            user: sessionUser,
            employee,
            date: today,
            todayAttendance,
            attendanceRecords,
            stats: {
                totalDays: attendanceRecords.length,
                present: attendanceRecords.filter(
                    record => record.status === "Present"
                ).length,
                late: attendanceRecords.filter(
                    record => record.status === "Late"
                ).length,
                halfDay: attendanceRecords.filter(
                    record => record.status === "Half Day"
                ).length,
                leave: attendanceRecords.filter(
                    record => record.status === "Leave"
                ).length,
                totalWorkMinutes,
                totalOvertimeMinutes,
                totalWorkHours: (
                    totalWorkMinutes / 60
                ).toFixed(1),
                totalOvertimeHours: (
                    totalOvertimeMinutes / 60
                ).toFixed(1)
            }
        });
    } catch (error) {
        console.error("My Attendance Error:", error);

        return res.status(500).send(
            "Unable to load your attendance."
        );
    }
};

// =====================================================
// CHECK IN
// POST /attendance/check-in/:employeeId
// =====================================================

exports.checkIn = async (req, res) => {
    try {
        const context = await getContextOrRespond(req, res);

        if (!context) return;

        const {
            dbUser,
            organizationId,
            isHR
        } = context;

        const employeeId = req.params.employeeId;

        if (!mongoose.isValidObjectId(employeeId)) {
            return res.status(400).send(
                "Invalid employee ID."
            );
        }

        const employee = await Employee.findOne({
            _id: employeeId,
            organization: organizationId,
            status: { $ne: "Exited" }
        });

        if (!employee) {
            return res.status(404).send(
                "Employee not found."
            );
        }

        // Employees may only check in for themselves.
        if (!isHR) {
            const currentEmployee = await getCurrentEmployee(
                dbUser,
                organizationId
            );

            if (
                !currentEmployee ||
                String(currentEmployee._id) !== String(employee._id)
            ) {
                return res.status(403).send(
                    "You can only mark your own attendance."
                );
            }
        }

        const today = getTodayDate();

        const existing = await Attendance.findOne({
            employee: employee._id,
            date: today
        });

        if (existing) {
            return res.status(400).send(
                "Attendance has already been marked for today."
            );
        }

        const now = new Date();

        await Attendance.create({
            employee: employee._id,
            date: today,
            checkIn: now,
            status: isLateCheckIn() ? "Late" : "Present",
            workMinutes: 0,
            overtimeMinutes: 0
        });

        return res.redirect(
            isHR ? "/attendance" : "/attendance/my"
        );
    } catch (error) {
        console.error("Check In Error:", error);

        if (error.code === 11000) {
            return res.status(400).send(
                "Attendance has already been marked for today."
            );
        }

        return res.status(500).send(
            "Unable to mark check-in."
        );
    }
};

// =====================================================
// CHECK OUT
// POST /attendance/check-out/:employeeId
// =====================================================

exports.checkOut = async (req, res) => {
    try {
        const context = await getContextOrRespond(req, res);

        if (!context) return;

        const {
            dbUser,
            organizationId,
            isHR
        } = context;

        const employeeId = req.params.employeeId;

        if (!mongoose.isValidObjectId(employeeId)) {
            return res.status(400).send(
                "Invalid employee ID."
            );
        }

        const employee = await Employee.findOne({
            _id: employeeId,
            organization: organizationId,
            status: { $ne: "Exited" }
        });

        if (!employee) {
            return res.status(404).send(
                "Employee not found."
            );
        }

        // Employees may only check out for themselves.
        if (!isHR) {
            const currentEmployee = await getCurrentEmployee(
                dbUser,
                organizationId
            );

            if (
                !currentEmployee ||
                String(currentEmployee._id) !== String(employee._id)
            ) {
                return res.status(403).send(
                    "You can only check out your own attendance."
                );
            }
        }

        const today = getTodayDate();

        const attendance = await Attendance.findOne({
            employee: employee._id,
            date: today
        });

        if (!attendance) {
            return res.status(400).send(
                "Employee has not checked in today."
            );
        }

        if (attendance.checkOut) {
            return res.status(400).send(
                "Employee has already checked out."
            );
        }

        if (!attendance.checkIn) {
            return res.status(400).send(
                "Check-in time is missing."
            );
        }

        const now = new Date();

        const workMinutes = Math.max(
            0,
            Math.floor(
                (
                    now.getTime() -
                    new Date(attendance.checkIn).getTime()
                ) / 60000
            )
        );

        attendance.checkOut = now;
        attendance.workMinutes = workMinutes;
        attendance.overtimeMinutes = Math.max(
            0,
            workMinutes - STANDARD_WORK_MINUTES
        );

        await attendance.save();

        return res.redirect(
            isHR ? "/attendance" : "/attendance/my"
        );
    } catch (error) {
        console.error("Check Out Error:", error);

        return res.status(500).send(
            "Unable to mark check-out."
        );
    }
};

// =====================================================
// ATTENDANCE HISTORY
// GET /attendance/history
//
// HR: organization-wide history.
// Employee: their own history only.
// =====================================================

exports.getAttendanceHistory = async (req, res) => {
    try {
        const context = await getContextOrRespond(req, res);

        if (!context) return;

        const {
            dbUser,
            organizationId,
            isHR,
            sessionUser
        } = context;

        const { year: currentYear, month: currentMonth } =
            getCurrentYearMonth();

        const year = Number(
            req.query.year || currentYear
        );

        const month = String(
            req.query.month || currentMonth
        ).padStart(2, "0");

        if (
            !Number.isInteger(year) ||
            year < 2000 ||
            year > currentYear + 1 ||
            !/^(0[1-9]|1[0-2])$/.test(month)
        ) {
            return res.status(400).send(
                "Invalid attendance history date filter."
            );
        }

        const selectedEmployeeId = String(
            req.query.employee || ""
        );

        // Build the requested month's date range.
        const startDate = `${year}-${month}-01`;

        const lastDay = new Date(
            Date.UTC(year, Number(month), 0)
        ).getUTCDate();

        const endDate =
            `${year}-${month}-${String(lastDay).padStart(2, "0")}`;

        let employees;
        let attendanceQuery;

        if (isHR) {
            employees = await getActiveEmployees(
                organizationId
            );

            const employeeIds = employees.map(
                employee => employee._id
            );

            attendanceQuery = {
                employee: { $in: employeeIds },
                date: {
                    $gte: startDate,
                    $lte: endDate
                }
            };

            if (selectedEmployeeId) {
                if (
                    !mongoose.isValidObjectId(
                        selectedEmployeeId
                    )
                ) {
                    return res.status(400).send(
                        "Invalid employee filter."
                    );
                }

                const belongsToOrganization = employees.some(
                    employee =>
                        String(employee._id) === selectedEmployeeId
                );

                if (!belongsToOrganization) {
                    return res.status(403).send(
                        "This employee does not belong to your organization."
                    );
                }

                attendanceQuery.employee = new mongoose.Types.ObjectId(
                    selectedEmployeeId
                );
            }
        } else {
            // Ignore any employee ID supplied by a non-HR user.
            const employee = await getCurrentEmployee(
                dbUser,
                organizationId
            );

            if (!employee) {
                return res.status(404).send(
                    "Employee profile not found. Please contact HR."
                );
            }

            employees = [employee];

            attendanceQuery = {
                employee: employee._id,
                date: {
                    $gte: startDate,
                    $lte: endDate
                }
            };
        }

        const attendance = await Attendance.find(
            attendanceQuery
        )
            .populate(
                "employee",
                "firstName lastName employeeId department"
            )
            .sort({ date: -1 })
            .lean();

        const total = attendance.length;

        const present = attendance.filter(
            record => record.status === "Present"
        ).length;

        const late = attendance.filter(
            record => record.status === "Late"
        ).length;

        const halfDay = attendance.filter(
            record => record.status === "Half Day"
        ).length;

        const leave = attendance.filter(
            record => record.status === "Leave"
        ).length;

        const totalWorkMinutes = attendance.reduce(
            (sum, record) =>
                sum + (Number(record.workMinutes) || 0),
            0
        );

        const totalOvertimeMinutes = attendance.reduce(
            (sum, record) =>
                sum + (Number(record.overtimeMinutes) || 0),
            0
        );

        return res.render("attendance/history", {
            title: "Attendance History",
            user: sessionUser,
            employees,
            attendance,
            stats: {
                total,
                present,
                late,
                halfDay,
                leave,
                totalWorkMinutes,
                totalOvertimeMinutes,
                totalWorkHours: (
                    totalWorkMinutes / 60
                ).toFixed(1),
                totalOvertimeHours: (
                    totalOvertimeMinutes / 60
                ).toFixed(1)
            },
            filters: {
                year,
                month,
                employee: isHR ? selectedEmployeeId : ""
            }
        });
    } catch (error) {
        console.error("Attendance History Error:", error);

        return res.status(500).send(
            "Unable to load attendance history."
        );
    }
};
