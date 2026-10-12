
const Employee = require("../models/Employee");
const Attendance = require("../models/Attendance");

// =====================================================
// CONFIGURATION
// =====================================================

const TIMEZONE = "Asia/Kolkata";
const STANDARD_WORK_MINUTES = 480;

// =====================================================
// DATE HELPERS
// =====================================================

function getTodayDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}

function getCurrentTimeInTimezone() {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).format(new Date());
}

function getMinutesFromTime(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
}

function getLateThreshold() {
    return getMinutesFromTime("10:15");
}

// =====================================================
// FIND EMPLOYEE
// =====================================================

async function getEmployeeById(employeeId) {
    if (!employeeId) {
        throw new Error("Employee ID is required.");
    }

    const employee = await Employee.findById(employeeId);

    if (!employee) {
        throw new Error("Employee not found.");
    }

    if (employee.status === "Exited") {
        throw new Error("Exited employees cannot mark attendance.");
    }

    return employee;
}

// =====================================================
// CHECK-IN
// =====================================================

async function checkIn(employeeId) {
    const employee = await getEmployeeById(employeeId);

    const date = getTodayDate();

    const existingAttendance = await Attendance.findOne({
        employee: employee._id,
        date
    });

    if (existingAttendance?.checkIn) {
        throw new Error("You have already checked in today.");
    }

    const now = new Date();

    const currentMinutes = getMinutesFromTime(
        getCurrentTimeInTimezone()
    );

    const status =
        currentMinutes > getLateThreshold()
            ? "Late"
            : "Present";

    try {
        return await Attendance.findOneAndUpdate(
            {
                employee: employee._id,
                date,
                checkIn: null,
                checkOut: null
            },
            {
                $set: {
                    checkIn: now,
                    status
                },
                $setOnInsert: {
                    employee: employee._id,
                    date,
                    workMinutes: 0,
                    overtimeMinutes: 0
                }
            },
            {
                upsert: true,
                new: true,
                runValidators: true
            }
        );
    } catch (error) {
        if (error.code === 11000) {
            throw new Error(
                "Attendance already exists for today. Please refresh and try again."
            );
        }

        throw error;
    }
}

// =====================================================
// CHECK-OUT
// =====================================================

async function checkOut(employeeId) {
    const employee = await getEmployeeById(employeeId);

    const date = getTodayDate();

    const attendance = await Attendance.findOne({
        employee: employee._id,
        date
    });

    if (!attendance || !attendance.checkIn) {
        throw new Error(
            "You must check in before checking out."
        );
    }

    if (attendance.checkOut) {
        throw new Error("You have already checked out today.");
    }

    const now = new Date();

    const elapsedMilliseconds =
        now.getTime() - new Date(attendance.checkIn).getTime();

    const workMinutes = Math.max(
        0,
        Math.floor(elapsedMilliseconds / 60000)
    );

    const overtimeMinutes = Math.max(
        0,
        workMinutes - STANDARD_WORK_MINUTES
    );

    const updatedAttendance = await Attendance.findOneAndUpdate(
        {
            _id: attendance._id,
            checkOut: null
        },
        {
            $set: {
                checkOut: now,
                workMinutes,
                overtimeMinutes
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!updatedAttendance) {
        throw new Error(
            "Attendance was updated by another request. Please refresh."
        );
    }

    return updatedAttendance;
}

// =====================================================
// GET EMPLOYEE'S TODAY ATTENDANCE
// =====================================================

async function getTodayAttendance(employeeId) {
    const employee = await getEmployeeById(employeeId);

    return Attendance.findOne({
        employee: employee._id,
        date: getTodayDate()
    }).lean();
}

// =====================================================
// GET EMPLOYEE ATTENDANCE HISTORY
// =====================================================

async function getAttendanceHistory(
    employeeId,
    { year, month, limit = 100 } = {}
) {
    const employee = await getEmployeeById(employeeId);

    const filter = {
        employee: employee._id
    };

    if (year !== undefined && year !== null && year !== "") {
        const parsedYear = Number(year);

        if (
            !Number.isInteger(parsedYear) ||
            parsedYear < 2000 ||
            parsedYear > 2200
        ) {
            throw new Error("Invalid year.");
        }

        filter.date = {
            $gte: `${parsedYear}-01-01`,
            $lte: `${parsedYear}-12-31`
        };
    }

    if (month !== undefined && month !== null && month !== "") {
        const parsedMonth = Number(month);

        if (
            !Number.isInteger(parsedMonth) ||
            parsedMonth < 1 ||
            parsedMonth > 12
        ) {
            throw new Error("Invalid month.");
        }

        const selectedYear =
            year !== undefined && year !== null && year !== ""
                ? Number(year)
                : Number(getTodayDate().slice(0, 4));

        const prefix =
            `${selectedYear}-${String(parsedMonth).padStart(2, "0")}`;

        filter.date = {
            $gte: `${prefix}-01`,
            $lte: `${prefix}-31`
        };
    }

    const parsedLimit = Number(limit);

    const safeLimit =
        Number.isInteger(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, 365)
            : 100;

    return Attendance.find(filter)
        .sort({ date: -1 })
        .limit(safeLimit)
        .lean();
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    getTodayDate,
    getCurrentTimeInTimezone,
    getEmployeeById,
    checkIn,
    checkOut,
    getTodayAttendance,
    getAttendanceHistory
};