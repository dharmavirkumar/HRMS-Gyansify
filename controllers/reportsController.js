
const mongoose = require("mongoose");
const LeaveRequest = require("../models/LeaveRequest");

const ALLOWED_STATUSES = [
    "Pending",
    "Approved",
    "Rejected",
    "Cancelled"
];

function getOrganizationId(req) {
    const user = req.session?.user;

    return user?.organizationId || user?.organization || null;
}

function getLeaveFilters(req) {
    const filters = {};
    const { fromDate, toDate, status, leaveType } = req.query;

    if (fromDate && !Number.isNaN(Date.parse(fromDate))) {
        filters.toDate = {
            $gte: new Date(fromDate)
        };
    }

    if (toDate && !Number.isNaN(Date.parse(toDate))) {
        filters.fromDate = {
            $lte: new Date(toDate)
        };
    }

    if (status && ALLOWED_STATUSES.includes(status)) {
        filters.status = status;
    }

    if (
        leaveType &&
        mongoose.Types.ObjectId.isValid(leaveType)
    ) {
        filters.leaveType = new mongoose.Types.ObjectId(leaveType);
    }

    return filters;
}

function buildStats(records) {
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
            (sum, item) => sum + (Number(item.totalDays) || 0),
            0
        )
    };
}

function getEmployeeName(employee) {
    if (!employee) return "Employee unavailable";

    if (employee.name) return employee.name;
    if (employee.fullName) return employee.fullName;

    const name = [
        employee.firstName,
        employee.middleName,
        employee.lastName
    ].filter(Boolean).join(" ");

    return name || employee.employeeCode || "Employee";
}

exports.getLeaveReport = async (req, res) => {
    try {
        const organizationId = getOrganizationId(req);

        // Never fetch all organizations' data if the session
        // does not identify the current organization.
        if (!organizationId) {
            return res.status(403).send(
                "Organization not found in your session. Please sign in again."
            );
        }

        const filters = getLeaveFilters(req);

        const leaveRequests = await LeaveRequest.find({
            organization: organizationId,
            ...filters
        })
            .populate("employee")
            .populate("leaveType")
            .sort({ createdAt: -1 })
            .lean();

        const stats = buildStats(leaveRequests);

        const leaveTypes = [
            ...new Map(
                leaveRequests
                    .filter(item => item.leaveType)
                    .map(item => [
                        String(item.leaveType._id),
                        {
                            _id: item.leaveType._id,
                            name:
                                item.leaveType.name ||
                                item.leaveType.title ||
                                item.leaveType.leaveType ||
                                "Leave"
                        }
                    ])
            ).values()
        ];

        return res.render("reports/leave", {
            title: "Leave Report",
            user: req.session?.user || null,

            // Pass compatible names for existing EJS templates.
            records: leaveRequests,
            leaveRequests,
            leaveStats: stats,
            stats,

            leaveTypes,
            query: req.query,
            filterQuery: req.query,

            getEmployeeName
        });
    } catch (error) {
        console.error("Leave Report Error:", error);

        return res.status(500).send(
            "Unable to load leave report. Please check the server logs."
        );
    }
};

exports.exportLeaveReport = async (req, res) => {
    try {
        const organizationId = getOrganizationId(req);

        if (!organizationId) {
            return res.status(403).send(
                "Organization not found in your session."
            );
        }

        const records = await LeaveRequest.find({
            organization: organizationId,
            ...getLeaveFilters(req)
        })
            .populate("employee")
            .populate("leaveType")
            .sort({ createdAt: -1 })
            .lean();

        const escapeCsv = value => {
            const text = String(value ?? "");
            return `"${text.replace(/"/g, '""')}"`;
        };

        const formatDate = value => {
            if (!value) return "";
            const date = new Date(value);

            if (Number.isNaN(date.getTime())) return "";

            return date.toISOString().slice(0, 10);
        };

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
            ...records.map(item => [
                getEmployeeName(item.employee),
                item.leaveType?.name ||
                    item.leaveType?.title ||
                    item.leaveType?.leaveType ||
                    "Leave",
                formatDate(item.fromDate),
                formatDate(item.toDate),
                item.totalDays,
                item.status,
                formatDate(item.createdAt),
                item.reason
            ])
        ];

        const csv = "\uFEFF" + rows
            .map(row => row.map(escapeCsv).join(","))
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

        return res.status(500).send(
            "Unable to export leave report."
        );
    }
};
