
const mongoose = require("mongoose");

const Employee = require("../models/Employee");
const Attendance = require("../models/Attendance");

// Load optional module models only when their reports are requested.
function loadModel(modelName, modelPath) {
    try {
        return require(modelPath);
    } catch (error) {
        if (error.code === "MODULE_NOT_FOUND") {
            throw new Error(
                `Required model "${modelName}" was not found. Check ${modelPath}.`
            );
        }

        throw error;
    }
}

// =====================================================
// VALIDATION HELPERS
// =====================================================

function validateObjectId(id, fieldName = "ID") {
    if (!mongoose.isValidObjectId(id)) {
        throw new Error(`Invalid ${fieldName}.`);
    }
}

function validatePeriod(year, month) {
    const parsedYear = Number(year);

    if (
        !Number.isInteger(parsedYear) ||
        parsedYear < 2000 ||
        parsedYear > 2200
    ) {
        throw new Error("Please provide a valid year.");
    }

    let parsedMonth;

    if (month !== undefined && month !== null && month !== "") {
        parsedMonth = Number(month);

        if (
            !Number.isInteger(parsedMonth) ||
            parsedMonth < 1 ||
            parsedMonth > 12
        ) {
            throw new Error("Month must be between 1 and 12.");
        }
    }

    return {
        year: parsedYear,
        month: parsedMonth
    };
}

function getDateRange(year, month) {
    if (month) {
        const start = `${year}-${String(month).padStart(2, "0")}-01`;

        const lastDay = new Date(year, month, 0).getDate();

        const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

        return { start, end };
    }

    return {
        start: `${year}-01-01`,
        end: `${year}-12-31`
    };
}

function getPagination(page = 1, limit = 20) {
    const currentPage = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(
        100,
        Math.max(1, Number(limit) || 20)
    );

    return {
        page: currentPage,
        limit: pageSize,
        skip: (currentPage - 1) * pageSize
    };
}

function toObjectId(id) {
    return new mongoose.Types.ObjectId(id);
}

// =====================================================
// EMPLOYEE REPORT
// =====================================================

async function getEmployeeReport(
    organizationId,
    {
        status,
        department,
        designation,
        search,
        page = 1,
        limit = 20
    } = {}
) {
    validateObjectId(organizationId, "organization ID");

    const filter = {
        organization: toObjectId(organizationId)
    };

    if (status) {
        filter.status = status;
    }

    if (department) {
        validateObjectId(department, "department ID");
        filter.department = toObjectId(department);
    }

    if (designation) {
        validateObjectId(designation, "designation ID");
        filter.designation = toObjectId(designation);
    }

    if (search && String(search).trim()) {
        const escapedSearch = String(search)
            .trim()
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const regex = new RegExp(escapedSearch, "i");

        filter.$or = [
            { employeeId: regex },
            { firstName: regex },
            { lastName: regex },
            { email: regex }
        ];
    }

    const pagination = getPagination(page, limit);

    const [employees, total] = await Promise.all([
        Employee.find(filter)
            .populate("department", "name")
            .populate("designation", "name")
            .populate("branch", "name")
            .sort({ createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean(),

        Employee.countDocuments(filter)
    ]);

    return {
        employees,
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total,
            pages: Math.ceil(total / pagination.limit)
        }
    };
}

// =====================================================
// EMPLOYEE SUMMARY
// =====================================================

async function getEmployeeSummary(organizationId) {
    validateObjectId(organizationId, "organization ID");

    const organization = toObjectId(organizationId);

    const [total, active, onLeave, exited, byDepartment] =
        await Promise.all([
            Employee.countDocuments({ organization }),

            Employee.countDocuments({
                organization,
                status: "Active"
            }),

            Employee.countDocuments({
                organization,
                status: "On Leave"
            }),

            Employee.countDocuments({
                organization,
                status: "Exited"
            }),

            Employee.aggregate([
                { $match: { organization } },
                {
                    $group: {
                        _id: "$department",
                        count: { $sum: 1 }
                    }
                },
                {
                    $lookup: {
                        from: "departments",
                        localField: "_id",
                        foreignField: "_id",
                        as: "departmentInfo"
                    }
                },
                {
                    $project: {
                        _id: 0,
                        departmentId: "$_id",
                        department: {
                            $ifNull: [
                                { $arrayElemAt: ["$departmentInfo.name", 0] },
                                "Unassigned"
                            ]
                        },
                        count: 1
                    }
                },
                { $sort: { count: -1 } }
            ])
        ]);

    return {
        total,
        active,
        onLeave,
        exited,
        byDepartment
    };
}

// =====================================================
// ATTENDANCE REPORT
// Attendance schema uses employee + date, with no
// organization field. Scope through organization employees.
// =====================================================

async function getAttendanceReport(
    organizationId,
    { year, month, employeeId, status, page = 1, limit = 20 } = {}
) {
    validateObjectId(organizationId, "organization ID");

    const period = validatePeriod(year, month);
    const range = getDateRange(period.year, period.month);

    const employeeFilter = {
        organization: toObjectId(organizationId)
    };

    if (employeeId) {
        validateObjectId(employeeId, "employee ID");
        employeeFilter._id = toObjectId(employeeId);
    }

    const employees = await Employee.find(employeeFilter)
        .select("_id employeeId firstName lastName department")
        .lean();

    const employeeIds = employees.map((employee) => employee._id);

    if (employeeIds.length === 0) {
        return {
            records: [],
            summary: {
                totalRecords: 0,
                present: 0,
                late: 0,
                absent: 0,
                halfDay: 0,
                leave: 0,
                holiday: 0
            },
            pagination: {
                page: 1,
                limit: Math.min(100, Math.max(1, Number(limit) || 20)),
                total: 0,
                pages: 0
            }
        };
    }

    const filter = {
        employee: { $in: employeeIds },
        date: {
            $gte: range.start,
            $lte: range.end
        }
    };

    if (status) {
        filter.status = status;
    }

    const pagination = getPagination(page, limit);

    const [records, total, grouped] = await Promise.all([
        Attendance.find(filter)
            .populate({
                path: "employee",
                select: "employeeId firstName lastName department",
                populate: {
                    path: "department",
                    select: "name"
                }
            })
            .sort({ date: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean(),

        Attendance.countDocuments(filter),

        Attendance.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ])
    ]);

    const counts = Object.fromEntries(
        grouped.map((item) => [item._id, item.count])
    );

    return {
        records,
        summary: {
            totalRecords: total,
            present: counts.Present || 0,
            late: counts.Late || 0,
            absent: counts.Absent || 0,
            halfDay: counts["Half Day"] || 0,
            leave: counts.Leave || 0,
            holiday: counts.Holiday || 0
        },
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total,
            pages: Math.ceil(total / pagination.limit)
        }
    };
}

// =====================================================
// LEAVE REPORT
// Assumes LeaveRequest fields:
// organization, employee, leaveType, fromDate, toDate,
// days, reason, status.
// =====================================================

async function getLeaveReport(
    organizationId,
    { year, month, status, employeeId, page = 1, limit = 20 } = {}
) {
    validateObjectId(organizationId, "organization ID");

    const period = validatePeriod(year, month);
    const range = getDateRange(period.year, period.month);

    const LeaveRequest = loadModel(
        "LeaveRequest",
        "../models/LeaveRequest"
    );

    const filter = {
        organization: toObjectId(organizationId),
        fromDate: { $lte: range.end },
        toDate: { $gte: range.start }
    };

    if (status) {
        filter.status = status;
    }

    if (employeeId) {
        validateObjectId(employeeId, "employee ID");
        filter.employee = toObjectId(employeeId);
    }

    const pagination = getPagination(page, limit);

    const [requests, total, grouped] = await Promise.all([
        LeaveRequest.find(filter)
            .populate("employee", "employeeId firstName lastName")
            .populate("leaveType", "name code isPaid")
            .sort({ createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean(),

        LeaveRequest.countDocuments(filter),

        LeaveRequest.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: "$status",
                    requests: { $sum: 1 },
                    days: { $sum: "$days" }
                }
            }
        ])
    ]);

    return {
        requests,
        summary: grouped.map((item) => ({
            status: item._id,
            requests: item.requests,
            days: item.days
        })),
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total,
            pages: Math.ceil(total / pagination.limit)
        }
    };
}

// =====================================================
// PAYROLL REPORT
// Assumes Payroll fields: organization, employee, month,
// year, grossSalary, totalDeductions, netSalary, status.
// =====================================================

async function getPayrollReport(
    organizationId,
    { year, month, status, employeeId, page = 1, limit = 20 } = {}
) {
    validateObjectId(organizationId, "organization ID");

    const period = validatePeriod(year, month);

    const Payroll = loadModel("Payroll", "../models/Payroll");

    const filter = {
        organization: toObjectId(organizationId),
        year: period.year
    };

    if (period.month) {
        filter.month = period.month;
    }

    if (status) {
        filter.status = status;
    }

    if (employeeId) {
        validateObjectId(employeeId, "employee ID");
        filter.employee = toObjectId(employeeId);
    }

    const pagination = getPagination(page, limit);

    const [records, total, summary] = await Promise.all([
        Payroll.find(filter)
            .populate("employee", "employeeId firstName lastName")
            .sort({ month: -1, createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean(),

        Payroll.countDocuments(filter),

        Payroll.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    grossSalary: { $sum: "$grossSalary" },
                    deductions: { $sum: "$totalDeductions" },
                    netSalary: { $sum: "$netSalary" }
                }
            }
        ])
    ]);

    return {
        records,
        summary: summary.map((item) => ({
            status: item._id,
            count: item.count,
            grossSalary: item.grossSalary,
            deductions: item.deductions,
            netSalary: item.netSalary
        })),
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total,
            pages: Math.ceil(total / pagination.limit)
        }
    };
}

// =====================================================
// RECRUITMENT REPORT
// Assumes JobOpening and Application models exist.
// Adjust model paths and fields to your actual schemas.
// =====================================================

async function getRecruitmentReport(
    organizationId,
    { year, month } = {}
) {
    validateObjectId(organizationId, "organization ID");

    const period = validatePeriod(year, month);

    const JobOpening = loadModel(
        "JobOpening",
        "../models/JobOpening"
    );

    const Application = loadModel(
        "Application",
        "../models/Application"
    );

    const jobFilter = {
        organization: toObjectId(organizationId)
    };

    const applicationFilter = {
        organization: toObjectId(organizationId)
    };

    if (period.month) {
        const start = new Date(
            Date.UTC(period.year, period.month - 1, 1)
        );

        const end = new Date(
            Date.UTC(period.year, period.month, 1)
        );

        applicationFilter.createdAt = {
            $gte: start,
            $lt: end
        };
    } else {
        const start = new Date(Date.UTC(period.year, 0, 1));
        const end = new Date(Date.UTC(period.year + 1, 0, 1));

        applicationFilter.createdAt = {
            $gte: start,
            $lt: end
        };
    }

    const [jobOpenings, applications, byStatus] = await Promise.all([
        JobOpening.find(jobFilter)
            .sort({ createdAt: -1 })
            .lean(),

        Application.countDocuments(applicationFilter),

        Application.aggregate([
            { $match: applicationFilter },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ])
    ]);

    return {
        jobOpenings,
        totalApplications: applications,
        applicationsByStatus: byStatus.map((item) => ({
            status: item._id,
            count: item.count
        }))
    };
}

// =====================================================
// DASHBOARD REPORT SUMMARY
// =====================================================

async function getDashboardReportSummary(
    organizationId,
    { year, month } = {}
) {
    const period = validatePeriod(year, month);

    const [
        employeeSummary,
        attendanceReport,
        leaveReport,
        payrollReport
    ] = await Promise.all([
        getEmployeeSummary(organizationId),

        getAttendanceReport(organizationId, {
            year: period.year,
            month: period.month,
            limit: 1
        }),

        getLeaveReport(organizationId, {
            year: period.year,
            month: period.month,
            limit: 1
        }),

        getPayrollReport(organizationId, {
            year: period.year,
            month: period.month,
            limit: 1
        })
    ]);

    return {
        period,
        employees: employeeSummary,
        attendance: attendanceReport.summary,
        leave: leaveReport.summary,
        payroll: payrollReport.summary
    };
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    getEmployeeReport,
    getEmployeeSummary,
    getAttendanceReport,
    getLeaveReport,
    getPayrollReport,
    getRecruitmentReport,
    getDashboardReportSummary
};