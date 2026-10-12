
const mongoose = require("mongoose");

const Employee = require("../models/Employee");
const SalaryStructure = require("../models/SalaryStructure");
const Payroll = require("../models/Payroll");
const PayrollItem = require("../models/PayrollItem");

// =====================================================
// CONFIGURATION
// =====================================================

const ACTIVE_EMPLOYEE_FILTER = {
    status: { $ne: "Exited" }
};

const PAYROLL_EMPLOYEE_STATUSES = [
    "Active",
    "On Leave",
    "Notice Period"
];

const SALARY_FIELDS = [
    "basicSalary",
    "hra",
    "conveyanceAllowance",
    "medicalAllowance",
    "specialAllowance",
    "otherAllowance",
    "providentFund",
    "professionalTax",
    "tds",
    "otherDeduction"
];

// =====================================================
// HELPERS
// =====================================================

const getOrganizationId = (req) => {
    const user = req.session?.user;

    const organization =
        user?.organizationId ??
        user?.organization ??
        user?.organizationID ??
        null;

    if (organization && typeof organization === "object") {
        return organization._id ?? organization.id ?? null;
    }

    return organization;
};

const normalizeObjectId = (value) => {
    if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
        return null;
    }

    return new mongoose.Types.ObjectId(String(value));
};

const isValidObjectId = (value) => {
    return (
        typeof value === "string" &&
        mongoose.Types.ObjectId.isValid(value) &&
        String(new mongoose.Types.ObjectId(value)) === value
    );
};

const parseMoney = (value, fieldName) => {
    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
    ) {
        if (fieldName === "basicSalary") {
            throw new Error("Basic salary is required.");
        }

        return 0;
    }

    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(
            `${fieldName} must be a valid non-negative number.`
        );
    }

    if (
        Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
    ) {
        throw new Error(
            `${fieldName} must have no more than two decimal places.`
        );
    }

    return Math.round(amount * 100) / 100;
};

const roundMoney = (amount) => {
    return Math.round(
        (Number(amount || 0) + Number.EPSILON) * 100
    ) / 100;
};

const calculateSalary = (salary) => {
    const grossSalary = roundMoney(
        salary.basicSalary +
        salary.hra +
        salary.conveyanceAllowance +
        salary.medicalAllowance +
        salary.specialAllowance +
        salary.otherAllowance
    );

    const totalDeductions = roundMoney(
        salary.providentFund +
        salary.professionalTax +
        salary.tds +
        salary.otherDeduction
    );

    const netSalary = roundMoney(grossSalary - totalDeductions);

    if (netSalary < 0) {
        throw new Error(
            "Total deductions cannot be greater than gross salary."
        );
    }

    return {
        grossSalary,
        totalDeductions,
        netSalary
    };
};

const parseEffectiveDate = (value) => {
    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
    ) {
        const now = new Date();
        now.setUTCHours(0, 0, 0, 0);
        return now;
    }

    const input = String(value).trim();
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);

        const date = new Date(Date.UTC(year, month - 1, day));

        if (
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day
        ) {
            throw new Error("Invalid effective date.");
        }

        return date;
    }

    const date = new Date(input);

    if (Number.isNaN(date.getTime())) {
        throw new Error("Invalid effective date.");
    }

    return date;
};

const getEmployeeName = (employee) => {
    if (!employee) {
        return "Employee not found";
    }

    return [
        employee.firstName,
        employee.lastName
    ].filter(Boolean).join(" ") ||
        employee.employeeId ||
        employee.email ||
        "Employee";
};

const renderError = (res, status, message) => {
    return res.status(status).send(message);
};

// Get the latest effective salary structure for each employee.
const getCurrentSalaryStructures = async (organizationId) => {
    const now = new Date();

    const structures = await SalaryStructure.find({
        organizationId,
        status: "ACTIVE",
        effectiveFrom: { $lte: now }
    })
        .sort({
            effectiveFrom: -1,
            createdAt: -1,
            _id: -1
        })
        .populate(
            "employee",
            "firstName lastName employeeId email status"
        )
        .lean();

    const latestByEmployee = new Map();

    for (const structure of structures) {
        const employeeId =
            structure.employee?._id?.toString() ??
            structure.employee?.toString();

        if (!employeeId || latestByEmployee.has(employeeId)) {
            continue;
        }

        latestByEmployee.set(employeeId, structure);
    }

    return Array.from(latestByEmployee.values());
};

// =====================================================
// PAYROLL DASHBOARD
// =====================================================

exports.getPayrollDashboard = async (req, res) => {
    try {
        const organizationId = normalizeObjectId(
            getOrganizationId(req)
        );

        if (!organizationId) {
            return renderError(
                res,
                400,
                "Organization information is missing or invalid."
            );
        }

        const [employeeCount, currentSalaryStructures] =
            await Promise.all([
                Employee.countDocuments({
                    organization: organizationId,
                    ...ACTIVE_EMPLOYEE_FILTER
                }),

                getCurrentSalaryStructures(organizationId)
            ]);

        const grossSalary = roundMoney(
            currentSalaryStructures.reduce(
                (total, item) =>
                    total + Number(item.grossSalary || 0),
                0
            )
        );

        const deductions = roundMoney(
            currentSalaryStructures.reduce(
                (total, item) =>
                    total + Number(item.totalDeductions || 0),
                0
            )
        );

        const netPayroll = roundMoney(
            currentSalaryStructures.reduce(
                (total, item) =>
                    total + Number(item.netSalary || 0),
                0
            )
        );

        return res.render("payroll/index", {
            title: "Payroll Management",
            user: req.session?.user || null,
            employeeCount,
            salaryStructures: currentSalaryStructures,
            grossSalary,
            deductions,
            netPayroll,
            currentDate: new Date()
        });
    } catch (error) {
        console.error("Payroll Dashboard Error:", error);

        return res.status(500).send(
            "Unable to load payroll dashboard."
        );
    }
};

// =====================================================
// SALARY STRUCTURES
// =====================================================

exports.getSalaryStructures = async (req, res) => {
    try {
        const organizationId = normalizeObjectId(
            getOrganizationId(req)
        );

        if (!organizationId) {
            return renderError(
                res,
                400,
                "Organization information is missing or invalid."
            );
        }

        const [employees, salaryStructures] = await Promise.all([
            Employee.find({
                organization: organizationId,
                ...ACTIVE_EMPLOYEE_FILTER
            })
                .select("firstName lastName employeeId email status")
                .sort({ firstName: 1, lastName: 1 })
                .lean(),

            SalaryStructure.find({
                organizationId,
                status: "ACTIVE"
            })
                .populate(
                    "employee",
                    "firstName lastName employeeId email status"
                )
                .sort({
                    effectiveFrom: -1,
                    createdAt: -1
                })
                .lean()
        ]);

        const now = new Date();
        const currentByEmployee = new Map();

        const sortedStructures = [...salaryStructures].sort(
            (a, b) =>
                new Date(b.effectiveFrom) -
                new Date(a.effectiveFrom)
        );

        for (const structure of sortedStructures) {
            const employeeId =
                structure.employee?._id?.toString();

            if (
                employeeId &&
                new Date(structure.effectiveFrom) <= now &&
                !currentByEmployee.has(employeeId)
            ) {
                currentByEmployee.set(
                    employeeId,
                    structure._id.toString()
                );
            }
        }

        const structuresForView = salaryStructures.map(
            (structure) => {
                const employeeId =
                    structure.employee?._id?.toString();

                return {
                    ...structure,
                    employeeName: getEmployeeName(
                        structure.employee
                    ),
                    isFutureEffective:
                        new Date(structure.effectiveFrom) > now,
                    isCurrent:
                        Boolean(employeeId) &&
                        currentByEmployee.get(employeeId) ===
                            structure._id.toString()
                };
            }
        );

        return res.render("payroll/salary-structures", {
            title: "Salary Structures",
            user: req.session?.user || null,
            employees,
            salaryStructures: structuresForView
        });
    } catch (error) {
        console.error("Salary Structure Error:", error);

        return res.status(500).send(
            "Unable to load salary structures."
        );
    }
};

// =====================================================
// CREATE SALARY STRUCTURE
// =====================================================

exports.createSalaryStructure = async (req, res) => {
    try {
        const organizationId = normalizeObjectId(
            getOrganizationId(req)
        );

        if (!organizationId) {
            return renderError(
                res,
                400,
                "Organization information is missing or invalid."
            );
        }

        const employeeId = String(
            req.body.employee || ""
        ).trim();

        if (!isValidObjectId(employeeId)) {
            return renderError(
                res,
                400,
                "Please select a valid employee."
            );
        }

        // Employee schema uses "organization".
        const employee = await Employee.findOne({
            _id: employeeId,
            organization: organizationId,
            ...ACTIVE_EMPLOYEE_FILTER
        }).select("_id firstName lastName employeeId email");

        if (!employee) {
            return renderError(
                res,
                404,
                "Employee not found in your organization, or the employee has exited."
            );
        }

        const salary = {};

        for (const field of SALARY_FIELDS) {
            salary[field] = parseMoney(req.body[field], field);
        }

        const totals = calculateSalary(salary);
        const effectiveFrom = parseEffectiveDate(
            req.body.effectiveFrom
        );

        const now = new Date();
        const isFutureEffective = effectiveFrom > now;

        const dayStart = new Date(effectiveFrom);
        dayStart.setUTCHours(0, 0, 0, 0);

        const dayEnd = new Date(dayStart);
        dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

        const duplicate = await SalaryStructure.findOne({
            organizationId,
            employee: employeeId,
            effectiveFrom: {
                $gte: dayStart,
                $lt: dayEnd
            }
        }).select("_id");

        if (duplicate) {
            return renderError(
                res,
                409,
                "A salary structure already exists for this employee on that effective date."
            );
        }

        const futureStructure = await SalaryStructure.findOne({
            organizationId,
            employee: employeeId,
            status: "ACTIVE",
            effectiveFrom: {
                $gt: now,
                $lte: effectiveFrom
            }
        }).select("_id effectiveFrom");

        if (futureStructure) {
            return renderError(
                res,
                409,
                "A scheduled salary structure already exists on or before this effective date. Review the salary history first."
            );
        }

        const newStructure = await SalaryStructure.create({
            organizationId,
            employee: employeeId,
            ...salary,
            ...totals,
            effectiveFrom,
            status: "ACTIVE"
        });

        if (!isFutureEffective) {
            try {
                await SalaryStructure.updateMany(
                    {
                        organizationId,
                        employee: employeeId,
                        status: "ACTIVE",
                        _id: { $ne: newStructure._id },
                        effectiveFrom: { $lte: now }
                    },
                    {
                        $set: { status: "INACTIVE" }
                    }
                );
            } catch (deactivationError) {
                await SalaryStructure.deleteOne({
                    _id: newStructure._id,
                    organizationId
                }).catch(cleanupError => {
                    console.error(
                        "Salary Structure Cleanup Error:",
                        cleanupError
                    );
                });

                throw deactivationError;
            }
        }

        return res.redirect("/payroll/salary-structures");
    } catch (error) {
        console.error("Create Salary Structure Error:", error);

        if (
            error.message &&
            (
                error.message.includes("salary") ||
                error.message.includes("Salary") ||
                error.message.includes("effective date") ||
                error.message.includes("decimal places") ||
                error.message.includes("valid non-negative") ||
                error.message.includes("deductions")
            )
        ) {
            return renderError(res, 400, error.message);
        }

        if (error.code === 11000) {
            return renderError(
                res,
                409,
                "A duplicate salary structure was detected. Refresh and try again."
            );
        }

        if (
            error.name === "ValidationError" ||
            error.name === "CastError"
        ) {
            return renderError(
                res,
                400,
                "Invalid salary structure data. Please check all fields."
            );
        }

        return res.status(500).send(
            "Unable to create salary structure."
        );
    }
};

// =====================================================
// PROCESS MONTHLY PAYROLL
// =====================================================

exports.processPayroll = async (req, res) => {
    let organizationId;
    let payrollId;

    try {
        organizationId = normalizeObjectId(
            getOrganizationId(req)
        );

        if (!organizationId) {
            return renderError(
                res,
                400,
                "Organization information is missing or invalid."
            );
        }

        const month = Number(req.body.payrollMonth);
        const year = Number(req.body.payrollYear);

        if (
            !Number.isInteger(month) ||
            month < 1 ||
            month > 12 ||
            !Number.isInteger(year) ||
            year < 2000 ||
            year > 2100
        ) {
            return renderError(
                res,
                400,
                "Please select a valid payroll month and year."
            );
        }

        const periodStart = new Date(
            Date.UTC(year, month - 1, 1)
        );

        const periodEnd = new Date(
            Date.UTC(year, month, 0, 23, 59, 59, 999)
        );

        const existingPayroll = await Payroll.findOne({
            organizationId,
            payrollMonth: month,
            payrollYear: year
        }).lean();

        if (existingPayroll) {
            return renderError(
                res,
                409,
                `Payroll already exists for ${month}/${year}. Status: ${existingPayroll.status}.`
            );
        }

        const employees = await Employee.find({
            organization: organizationId,
            status: { $in: PAYROLL_EMPLOYEE_STATUSES }
        })
            .select(
                "_id employeeId firstName lastName email status"
            )
            .sort({ employeeId: 1 })
            .lean();

        if (!employees.length) {
            return renderError(
                res,
                400,
                "No eligible employees were found for payroll."
            );
        }

        // Get the latest structure effective on or before the
        // selected payroll period end. Future structures are excluded.
        const structures = await SalaryStructure.find({
            organizationId,
            status: "ACTIVE",
            effectiveFrom: { $lte: periodEnd }
        })
            .sort({
                effectiveFrom: -1,
                createdAt: -1,
                _id: -1
            })
            .lean();

        const structureByEmployee = new Map();

        for (const structure of structures) {
            const key = String(structure.employee);

            if (!structureByEmployee.has(key)) {
                structureByEmployee.set(key, structure);
            }
        }

        const missingEmployees = employees.filter(
            employee =>
                !structureByEmployee.has(String(employee._id))
        );

        if (missingEmployees.length) {
            const names = missingEmployees
                .map(employee => employee.employeeId)
                .join(", ");

            return renderError(
                res,
                400,
                `Missing active salary structures for: ${names}.`
            );
        }

        const items = employees.map(employee => {
            const structure = structureByEmployee.get(
                String(employee._id)
            );

            const salary = {};

            for (const field of SALARY_FIELDS) {
                salary[field] = parseMoney(
                    structure[field],
                    field
                );
            }

            return {
                organizationId,
                employee: employee._id,
                salaryStructure: structure._id,

                employeeCode: employee.employeeId,
                employeeName: getEmployeeName(employee),
                email: employee.email || "",

                payrollMonth: month,
                payrollYear: year,

                ...salary,
                ...calculateSalary(salary),
                status: "PROCESSED"
            };
        });

        const sumField = field => roundMoney(
            items.reduce(
                (total, item) => total + item[field],
                0
            )
        );

        const rawUserId =
            req.session?.user?._id ??
            req.session?.user?.id ??
            null;

        const processedBy = normalizeObjectId(rawUserId);

        const payrollNumber =
            `PAY-${year}${String(month).padStart(2, "0")}-` +
            new mongoose.Types.ObjectId().toString();

        const payroll = await Payroll.create({
            organizationId,
            payrollMonth: month,
            payrollYear: year,
            periodStart,
            periodEnd,
            payrollNumber,
            totalEmployees: employees.length,
            processedEmployees: 0,
            totalGrossSalary: 0,
            totalDeductions: 0,
            totalNetSalary: 0,
            status: "PROCESSING",
            processedBy,
            notes:
                typeof req.body.notes === "string"
                    ? req.body.notes.trim().slice(0, 2000)
                    : ""
        });

        payrollId = payroll._id;

        await PayrollItem.insertMany(
            items.map(item => ({
                ...item,
                payroll: payrollId
            })),
            { ordered: true }
        );

        payroll.processedEmployees = items.length;
        payroll.totalGrossSalary = sumField("grossSalary");
        payroll.totalDeductions = sumField("totalDeductions");
        payroll.totalNetSalary = sumField("netSalary");
        payroll.totalTDS = sumField("tds");
        payroll.totalPF = sumField("providentFund");
        payroll.totalProfessionalTax = sumField(
            "professionalTax"
        );

        // These amounts are not calculated by this implementation.
        payroll.totalESI = 0;
        payroll.totalBonus = 0;
        payroll.totalOvertime = 0;

        payroll.status = "PROCESSED";
        payroll.processedAt = new Date();

        await payroll.save();

        return res.redirect("/payroll/history");
    } catch (error) {
        console.error("Process Payroll Error:", error);

        if (payrollId && organizationId) {
            try {
                await PayrollItem.deleteMany({
                    organizationId,
                    payroll: payrollId
                });

                await Payroll.deleteOne({
                    _id: payrollId,
                    organizationId,
                    status: "PROCESSING"
                });
            } catch (cleanupError) {
                console.error(
                    "Payroll Cleanup Error:",
                    cleanupError
                );
            }
        }

        if (error.code === 11000) {
            return renderError(
                res,
                409,
                "A payroll already exists for this organization and month."
            );
        }

        if (
            error.message &&
            (
                error.message.includes("salary") ||
                error.message.includes("Salary") ||
                error.message.includes("deductions") ||
                error.message.includes("decimal places") ||
                error.message.includes("valid non-negative")
            )
        ) {
            return renderError(res, 400, error.message);
        }

        if (
            error.name === "ValidationError" ||
            error.name === "CastError"
        ) {
            return renderError(
                res,
                400,
                "Invalid payroll data. Check your payroll and salary schemas."
            );
        }

        return res.status(500).send(
            "Unable to process payroll. Check the server logs."
        );
    }
};

/* =====================================================
   EMPLOYEE PAYSLIPS
   Reads salary snapshots from PayrollItem
===================================================== */

exports.getPayslips = async (req, res, next) => {
    try {
        const sessionUser = req.session?.user;

        if (!sessionUser) {
            return res.redirect("/auth/login");
        }

        const organizationId = normalizeObjectId(
            getOrganizationId(req)
        );

        if (!organizationId) {
            return res.status(400).send(
                "Organization information is missing or invalid."
            );
        }

        const role = String(
            sessionUser.role || ""
        ).toUpperCase();

        const query = { organizationId };

        // Employees can only view their own payslips.
        if (role === "EMPLOYEE") {
            
const employeeId = normalizeObjectId(
    sessionUser.employee || sessionUser.employeeId
);


            if (!employeeId) {
                return res.status(200).render(
                    "payroll/payslips",
                    {
                        title: "My Payslips",
                        user: sessionUser,
                        payslips: [],
                        filters: {},
                        stats: {
                            total: 0,
                            paidCount: 0,
                            pendingCount: 0,
                            totalNetSalary: 0,
                            totalDeductions: 0
                        },
                        pagination: null,
                        error:
                            "Your account is not linked to an employee record. Please contact HR."
                    }
                );
            }

            query.employee = employeeId;
        }

        const month = String(
            req.query.month || ""
        ).trim();

        const year = String(
            req.query.year || ""
        ).trim();

        const search = String(
            req.query.search || ""
        ).trim().toLowerCase();

        const status = String(
            req.query.status || ""
        ).trim().toUpperCase();

        if (
            month &&
            Number.isInteger(Number(month)) &&
            Number(month) >= 1 &&
            Number(month) <= 12
        ) {
            query.payrollMonth = Number(month);
        }

        if (
            year &&
            Number.isInteger(Number(year)) &&
            Number(year) >= 2000 &&
            Number(year) <= 2100
        ) {
            query.payrollYear = Number(year);
        }

        const allowedStatuses = [
            "PROCESSED",
            "APPROVED",
            "PAID",
            "CANCELLED"
        ];

        if (allowedStatuses.includes(status)) {
            query.status = status;
        }

        let payslips = await PayrollItem.find(query)
            .populate(
                "employee",
                "firstName lastName employeeId email"
            )
            .populate(
                "payroll",
                "payrollNumber status paymentDate paymentMode periodStart periodEnd"
            )
            .sort({
                payrollYear: -1,
                payrollMonth: -1,
                createdAt: -1
            })
            .lean();

        // Search by employee name or employee code.
        if (search) {
            payslips = payslips.filter((item) => {
                const employee = item.employee || {};

                const name = [
                    employee.firstName || "",
                    employee.lastName || ""
                ].join(" ").toLowerCase();

                const code = String(
                    item.employeeCode ||
                    employee.employeeId ||
                    ""
                ).toLowerCase();

                return (
                    name.includes(search) ||
                    code.includes(search)
                );
            });
        }

        const money = (value) => {
            const number = Number(value);
            return Number.isFinite(number) ? number : 0;
        };

        const paidCount = payslips.filter(
            item =>
                item.status === "PAID" ||
                item.payroll?.status === "PAID"
        ).length;

        const pendingCount = payslips.filter(
            item =>
                item.status === "PROCESSED" ||
                item.status === "APPROVED"
        ).length;

        const totalNetSalary = payslips.reduce(
            (sum, item) => sum + money(item.netSalary),
            0
        );

        const totalDeductions = payslips.reduce(
            (sum, item) => sum + money(item.totalDeductions),
            0
        );

        return res.render("payroll/payslips", {
            title:
                role === "EMPLOYEE"
                    ? "My Payslips"
                    : "Employee Payslips",

            user: sessionUser,
            payslips,

            filters: {
                month,
                year,
                search: req.query.search || "",
                status,
                currentYear: new Date().getFullYear()
            },

            stats: {
                total: payslips.length,
                paidCount,
                pendingCount,
                totalNetSalary,
                totalDeductions
            },

            pagination: null,
            error: null
        });
    } catch (error) {
        console.error("Get Payslips Error:", error);
        return next(error);
    }
};


exports.getPayrollHistory = async (req, res) => {
    try {
        const organizationId = normalizeObjectId(
            getOrganizationId(req)
        );

        if (!organizationId) {
            return res.status(400).send(
                "Organization information is missing or invalid."
            );
        }

        const payrolls = await Payroll.find({
            organizationId
        })
            .sort({
                payrollYear: -1,
                payrollMonth: -1,
                createdAt: -1
            })
            .lean();

        return res.render("payroll/history", {
            title: "Payroll History",
            user: req.session?.user || null,
            payrolls
        });
    } catch (error) {
        console.error("Payroll History Error:", error);

        return res.status(500).send(
            "Unable to load payroll history."
        );
    }
};

exports.getPayslipDetails = async (req, res, next) => {
    try {
        const sessionUser = req.session?.user;

        if (!sessionUser) {
            return res.redirect("/auth/login");
        }

        const organizationId = normalizeObjectId(
            getOrganizationId(req)
        );

        if (!organizationId) {
            return res.status(400).send(
                "Organization information is missing or invalid."
            );
        }

        const payslipId = normalizeObjectId(req.params.id);

        if (!payslipId) {
            return res.status(400).send("Invalid payslip ID.");
        }

        const role = String(sessionUser.role || "").toUpperCase();

        const query = {
            _id: payslipId,
            organizationId
        };

        // Employees can access only their own payslips.
        if (role === "EMPLOYEE") {
            const employeeId = normalizeObjectId(
                sessionUser.employee || sessionUser.employeeId
            );

            if (!employeeId) {
                return res.status(403).send(
                    "Your account is not linked to an employee record."
                );
            }

            query.employee = employeeId;
        }

        const payslip = await PayrollItem.findOne(query)
            .populate(
                "employee",
                "firstName lastName employeeId email department designation"
            )
            .populate(
                "payroll",
                "payrollNumber payrollMonth payrollYear periodStart periodEnd status paymentDate paymentMode"
            )
            .populate(
                "salaryStructure"
            )
            .lean();

        if (!payslip) {
            return res.status(404).send(
                "Payslip not found, or you do not have permission to view it."
            );
        }

        return res.render("payroll/payslip-details", {
            title: "Payslip Details",
            user: sessionUser,
            payslip
        });
    } catch (error) {
        console.error("Payslip Details Error:", error);
        return next(error);
    }
};

