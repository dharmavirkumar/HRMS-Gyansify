
"use strict";

const mongoose = require("mongoose");

const Attendance = require("../models/Attendance");
const Employee = require("../models/Employee");
const User = require("../models/User");
const OfficeLocation = require("../models/OfficeLocation");
const AttendanceAudit = require("../models/AttendanceAudit");

const {
    calculateDistanceMeters,
    verifyCoordinates
} = require("../utils/geofence");

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

const getZonedParts = (options) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE,
        ...options
    }).formatToParts(new Date());

    return Object.fromEntries(
        parts
            .filter(part => part.type !== "literal")
            .map(part => [part.type, part.value])
    );
};

const getTodayDate = () => {
    const values = getZonedParts({
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });

    return `${values.year}-${values.month}-${values.day}`;
};

const getCurrentYearMonth = () => {
    const values = getZonedParts({
        year: "numeric",
        month: "2-digit"
    });

    return {
        year: Number(values.year),
        month: values.month
    };
};

const getIndiaTimeParts = () => {
    const values = getZonedParts({
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    });

    return {
        hour: Number(values.hour),
        minute: Number(values.minute)
    };
};

const isLateCheckIn = () => {
    const { hour, minute } = getIndiaTimeParts();

    return (
        hour > LATE_HOUR ||
        (hour === LATE_HOUR && minute >= LATE_MINUTE)
    );
};

// =====================================================
// AUTHENTICATION / ROLE HELPERS
// =====================================================

const getSessionUserId = (req) =>
    req.session?.user?._id ||
    req.session?.user?.id ||
    req.session?.userId ||
    null;

const normalizeRole = (value) => {
    if (!value) return "";

    if (typeof value === "string") {
        return value.trim().toUpperCase().replace(/[\s-]+/g, "_");
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

        const code = normalizeRole(value);
        if (code) codes.push(code);
    };

    candidates.forEach(collect);

    return [...new Set(codes)];
};

const isHRUser = (dbUser, sessionUser) => {
    const codes = [
        ...collectRoleCodes(dbUser),
        ...collectRoleCodes(sessionUser)
    ];

    return codes.some(code => HR_ROLES.has(code));
};

// =====================================================
// REQUEST CONTEXT
// =====================================================

const getRequestContext = async (req) => {
    const userId = getSessionUserId(req);

    if (!userId || !mongoose.isValidObjectId(String(userId))) {
        return {
            error: "Authentication required.",
            status: 401
        };
    }

    let userQuery = User.findById(userId).select(
        "name email organization organizationId employee role roles roleCode status"
    );

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
        !mongoose.isValidObjectId(String(organizationId))
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

const getContextOrRespond = async (req, res) => {
    const context = await getRequestContext(req);

    if (context.error) {
        if (context.status === 401) {
            res.redirect("/auth/login");
            return null;
        }

        res.status(context.status).send(context.error);
        return null;
    }

    return context;
};

// =====================================================
// EMPLOYEE HELPERS
// =====================================================

const getActiveEmployees = (organizationId) =>
    Employee.find({
        organization: organizationId,
        status: { $ne: "Exited" }
    })
        .populate("department", "name")
        .populate("designation", "name")
        .sort({ firstName: 1 });

const getEmployeeForOrganization = (employeeId, organizationId) =>
    Employee.findOne({
        _id: employeeId,
        organization: organizationId,
        status: { $ne: "Exited" }
    });

const getCurrentEmployee = async (dbUser, organizationId) => {
    let employee = null;

    const linkedEmployeeId =
        dbUser.employee?._id ||
        dbUser.employee ||
        null;

    if (
        linkedEmployeeId &&
        mongoose.isValidObjectId(String(linkedEmployeeId))
    ) {
        employee = await Employee.findOne({
            _id: linkedEmployeeId,
            organization: organizationId,
            status: { $ne: "Exited" }
        });
    }

    if (!employee && dbUser.email) {
        const escapedEmail = String(dbUser.email).replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

        employee = await Employee.findOne({
            organization: organizationId,
            email: {
                $regex: `^${escapedEmail}$`,
                $options: "i"
            },
            status: { $ne: "Exited" }
        });

        if (employee && User.schema.path("employee")) {
            const userFilter = { _id: dbUser._id };

            if (User.schema.path("organization")) {
                userFilter.organization = organizationId;
            } else if (User.schema.path("organizationId")) {
                userFilter.organizationId = organizationId;
            }

            await User.updateOne(userFilter, {
                $set: { employee: employee._id }
            });
        }
    }

    return employee;
};

// =====================================================
// AUDIT HELPER
// =====================================================

const writeAttendanceAudit = async ({
    organizationId,
    employeeId,
    attendanceId = null,
    action,
    latitude,
    longitude,
    distanceMeters,
    allowedRadiusMeters,
    allowed,
    reason
}) => {
    try {
        await AttendanceAudit.create({
            organization: organizationId,
            employee: employeeId,
            attendance: attendanceId,
            action,
            latitude,
            longitude,
            distanceMeters,
            allowedRadiusMeters,
            allowed,
            reason
        });
    } catch (error) {
        // Audit failure must never be silently ignored.
        // Attendance itself may already have been saved.
        console.error("Attendance Audit Write Error:", error);
        throw error;
    }
};

// =====================================================
// GPS INPUT
// =====================================================

const getCoordinatesFromRequest = (req) => {
    const latitudeValue = req.body?.latitude;
    const longitudeValue = req.body?.longitude;

    if (
        latitudeValue === undefined ||
        longitudeValue === undefined ||
        String(latitudeValue).trim() === "" ||
        String(longitudeValue).trim() === ""
    ) {
        return null;
    }

    const latitude = Number(latitudeValue);
    const longitude = Number(longitudeValue);

    if (!verifyCoordinates(latitude, longitude)) {
        return null;
    }

    return { latitude, longitude };
};

// =====================================================
// GEOFENCE VERIFICATION
//
// Rejected valid-coordinate attempts are audited here.
// Allowed attempts are audited only after the attendance
// operation succeeds, using its exact attendance ID.
// =====================================================

const verifyOfficeLocation = async ({
    organizationId,
    employeeId,
    attendanceId = null,
    action,
    latitude,
    longitude
}) => {
    if (!verifyCoordinates(latitude, longitude)) {
        return {
            ok: false,
            status: 400,
            message: "Valid device location is required."
        };
    }

    const office = await OfficeLocation.findOne({
        organization: organizationId,
        isActive: true
    }).lean();

    if (!office) {
        return {
            ok: false,
            status: 409,
            message:
                "Office location has not been configured. Please contact HR."
        };
    }

    const distance = calculateDistanceMeters(
        Number(office.latitude),
        Number(office.longitude),
        latitude,
        longitude
    );

    const distanceMeters = Math.round(distance * 100) / 100;
    const allowedRadiusMeters = Number(office.radiusMeters);
    const allowed = distance <= allowedRadiusMeters;

    if (!allowed) {
        await writeAttendanceAudit({
            organizationId,
            employeeId,
            attendanceId,
            action,
            latitude,
            longitude,
            distanceMeters,
            allowedRadiusMeters,
            allowed: false,
            reason: "Outside office geofence"
        });

        return {
            ok: false,
            status: 403,
            message:
                `You are ${distanceMeters} meters from the office. ` +
                `Attendance is allowed only within ${allowedRadiusMeters} meters.`,
            distanceMeters
        };
    }

    return {
        ok: true,
        office,
        distanceMeters,
        allowedRadiusMeters
    };
};

// =====================================================
// TODAY'S ATTENDANCE
// GET /attendance
// =====================================================

exports.getTodayAttendance = async (req, res) => {
    try {
        const context = await getContextOrRespond(req, res);
        if (!context) return;

        const { organizationId, isHR, sessionUser } = context;

        if (!isHR) {
            return res.redirect("/attendance/my");
        }

        const today = getTodayDate();
        const employees = await getActiveEmployees(organizationId);
        const employeeIds = employees.map(employee => employee._id);

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

        for (const record of attendance) {
            if (record.employee) {
                attendanceMap.set(
                    String(record.employee._id),
                    record
                );
            }
        }

        const rows = employees.map(employee => ({
            employee,
            attendance:
                attendanceMap.get(String(employee._id)) || null
        }));

        const countStatus = status =>
            attendance.filter(record => record.status === status).length;

        const recordedIds = new Set(
            attendance
                .filter(record => record.employee)
                .map(record => String(record.employee._id))
        );

        const absent = employees.filter(
            employee => !recordedIds.has(String(employee._id))
        ).length;

        return res.render("attendance/index", {
            title: "Today's Attendance",
            user: sessionUser,
            date: today,
            rows,
            stats: {
                total: employees.length,
                present: countStatus("Present"),
                late: countStatus("Late"),
                halfDay: countStatus("Half Day"),
                leave: countStatus("Leave"),
                absent
            }
        });
    } catch (error) {
        console.error("Today Attendance Error:", error);
        return res.status(500).send("Unable to load attendance.");
    }
};

// =====================================================
// MY ATTENDANCE
// GET /attendance/my
// =====================================================

exports.getMyAttendance = async (req, res) => {
    try {
        const context = await getContextOrRespond(req, res);
        if (!context) return;

        const { dbUser, organizationId, sessionUser } = context;

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
            (sum, record) => sum + (Number(record.workMinutes) || 0),
            0
        );

        const totalOvertimeMinutes = attendanceRecords.reduce(
            (sum, record) => sum + (Number(record.overtimeMinutes) || 0),
            0
        );

        const countStatus = status =>
            attendanceRecords.filter(
                record => record.status === status
            ).length;

        return res.render("attendance/my", {
            title: "My Attendance",
            user: sessionUser,
            employee,
            date: today,
            todayAttendance,
            attendanceRecords,
            stats: {
                totalDays: attendanceRecords.length,
                present: countStatus("Present"),
                late: countStatus("Late"),
                halfDay: countStatus("Half Day"),
                leave: countStatus("Leave"),
                totalWorkMinutes,
                totalOvertimeMinutes,
                totalWorkHours: (totalWorkMinutes / 60).toFixed(1),
                totalOvertimeHours: (totalOvertimeMinutes / 60).toFixed(1)
            }
        });
    } catch (error) {
        console.error("My Attendance Error:", error);
        return res.status(500).send("Unable to load your attendance.");
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

        const { dbUser, organizationId, isHR } = context;
        const employeeId = req.params.employeeId;

        if (!mongoose.isValidObjectId(employeeId)) {
            return res.status(400).send("Invalid employee ID.");
        }

        const employee = await getEmployeeForOrganization(
            employeeId,
            organizationId
        );

        if (!employee) {
            return res.status(404).send("Employee not found.");
        }

        // Non-HR users can only check in for themselves.
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
        }).select("_id");

        if (existing) {
            return res.status(409).send(
                "Attendance has already been marked for today."
            );
        }

        const coordinates = getCoordinatesFromRequest(req);

        if (!coordinates) {
            return res.status(400).send(
                "Device location is required. Allow location access and try again."
            );
        }

        const geoResult = await verifyOfficeLocation({
            organizationId,
            employeeId: employee._id,
            action: "CHECK_IN",
            latitude: coordinates.latitude,
            longitude: coordinates.longitude
        });

        if (!geoResult.ok) {
            return res.status(geoResult.status).send(geoResult.message);
        }

        const now = new Date();

        // The unique employee/date index is the final protection
        // against simultaneous check-in requests.
        const attendance = await Attendance.create({
            employee: employee._id,
            date: today,
            checkIn: now,
            status: isLateCheckIn() ? "Late" : "Present",
            workMinutes: 0,
            overtimeMinutes: 0
        });

        // Link the successful audit directly to the created record.
        // No timestamp-based lookup or race-prone audit update.
        await writeAttendanceAudit({
            organizationId,
            employeeId: employee._id,
            attendanceId: attendance._id,
            action: "CHECK_IN",
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            distanceMeters: geoResult.distanceMeters,
            allowedRadiusMeters: geoResult.allowedRadiusMeters,
            allowed: true,
            reason: "Within office geofence"
        });

        return res.redirect(isHR ? "/attendance" : "/attendance/my");
    } catch (error) {
        console.error("Check In Error:", error);

        if (error.code === 11000) {
            return res.status(409).send(
                "Attendance has already been marked for today."
            );
        }

        return res.status(500).send("Unable to mark check-in.");
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

        const { dbUser, organizationId, isHR } = context;
        const employeeId = req.params.employeeId;

        if (!mongoose.isValidObjectId(employeeId)) {
            return res.status(400).send("Invalid employee ID.");
        }

        const employee = await getEmployeeForOrganization(
            employeeId,
            organizationId
        );

        if (!employee) {
            return res.status(404).send("Employee not found.");
        }

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
            return res.status(409).send(
                "Employee has already checked out."
            );
        }

        if (!attendance.checkIn) {
            return res.status(400).send("Check-in time is missing.");
        }

        const coordinates = getCoordinatesFromRequest(req);

        if (!coordinates) {
            return res.status(400).send(
                "Device location is required. Allow location access and try again."
            );
        }

        const geoResult = await verifyOfficeLocation({
            organizationId,
            employeeId: employee._id,
            attendanceId: attendance._id,
            action: "CHECK_OUT",
            latitude: coordinates.latitude,
            longitude: coordinates.longitude
        });

        if (!geoResult.ok) {
            return res.status(geoResult.status).send(geoResult.message);
        }

        const now = new Date();

        const workMinutes = Math.max(
            0,
            Math.floor(
                (now.getTime() - new Date(attendance.checkIn).getTime()) /
                60000
            )
        );

        const overtimeMinutes = Math.max(
            0,
            workMinutes - STANDARD_WORK_MINUTES
        );

        // Atomic conditional update prevents two concurrent requests
        // from successfully checking out the same attendance record.
        const updateResult = await Attendance.updateOne(
            {
                _id: attendance._id,
                employee: employee._id,
                date: today,
                checkOut: null,
                checkIn: { $ne: null }
            },
            {
                $set: {
                    checkOut: now,
                    workMinutes,
                    overtimeMinutes
                }
            }
        );

        if (updateResult.modifiedCount !== 1) {
            return res.status(409).send(
                "Attendance was already checked out. Refresh the page."
            );
        }

        await writeAttendanceAudit({
            organizationId,
            employeeId: employee._id,
            attendanceId: attendance._id,
            action: "CHECK_OUT",
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            distanceMeters: geoResult.distanceMeters,
            allowedRadiusMeters: geoResult.allowedRadiusMeters,
            allowed: true,
            reason: "Within office geofence"
        });

        return res.redirect(isHR ? "/attendance" : "/attendance/my");
    } catch (error) {
        console.error("Check Out Error:", error);
        return res.status(500).send("Unable to mark check-out.");
    }
};

// =====================================================
// ATTENDANCE HISTORY
// GET /attendance/history
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

        const {
            year: currentYear,
            month: currentMonth
        } = getCurrentYearMonth();

        const year = Number(req.query.year || currentYear);
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

        const startDate = `${year}-${month}-01`;

        const lastDay = new Date(
            Date.UTC(year, Number(month), 0)
        ).getUTCDate();

        const endDate =
            `${year}-${month}-${String(lastDay).padStart(2, "0")}`;

        let employees;
        let attendanceQuery;

        if (isHR) {
            employees = await getActiveEmployees(organizationId);

            const employeeIds = employees.map(employee => employee._id);

            attendanceQuery = {
                employee: { $in: employeeIds },
                date: { $gte: startDate, $lte: endDate }
            };

            if (selectedEmployeeId) {
                if (!mongoose.isValidObjectId(selectedEmployeeId)) {
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

                attendanceQuery.employee =
                    new mongoose.Types.ObjectId(selectedEmployeeId);
            }
        } else {
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
                date: { $gte: startDate, $lte: endDate }
            };
        }

        const attendance = await Attendance.find(attendanceQuery)
            .populate(
                "employee",
                "firstName lastName employeeId department"
            )
            .sort({ date: -1 })
            .lean();

        const countStatus = status =>
            attendance.filter(record => record.status === status).length;

        const totalWorkMinutes = attendance.reduce(
            (sum, record) => sum + (Number(record.workMinutes) || 0),
            0
        );

        const totalOvertimeMinutes = attendance.reduce(
            (sum, record) => sum + (Number(record.overtimeMinutes) || 0),
            0
        );

        return res.render("attendance/history", {
            title: "Attendance History",
            user: sessionUser,
            employees,
            attendance,
            stats: {
                total: attendance.length,
                present: countStatus("Present"),
                late: countStatus("Late"),
                halfDay: countStatus("Half Day"),
                leave: countStatus("Leave"),
                totalWorkMinutes,
                totalOvertimeMinutes,
                totalWorkHours: (totalWorkMinutes / 60).toFixed(1),
                totalOvertimeHours: (totalOvertimeMinutes / 60).toFixed(1)
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
