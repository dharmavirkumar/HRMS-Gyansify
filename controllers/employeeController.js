
"use strict";

const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const Employee = require("../models/Employee");
const Department = require("../models/Department");
const Designation = require("../models/Designation");
const Branch = require("../models/Branch");
const Location = require("../models/Location");
const Organization = require("../models/Organization");
const LeaveType = require("../models/LeaveType");
const LeaveBalance = require("../models/LeaveBalance");
const User = require("../models/User");

const { sendEmail } = require("../config/mailer");

// =====================================================
// GYANSIFY HRMS - EMPLOYEE CONTROLLER
// =====================================================

const EMPLOYMENT_TYPES = [
    "Permanent",
    "Probation",
    "Contract",
    "Intern",
    "Part Time"
];

const EMPLOYEE_STATUSES = [
    "Active",
    "On Leave",
    "Notice Period",
    "Suspended",
    "Exited"
];

const USER_ROLES = [
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE",
    "MANAGER",
    "EMPLOYEE"
];

const HR_ROLES = [
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE"
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPLOYEE_ID_REGEX = /^[A-Za-z0-9_-]+$/;

// =====================================================
// GENERAL HELPERS
// =====================================================

const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const isValidObjectId = (value) =>
    mongoose.isValidObjectId(String(value || ""));

const normalizeEmail = (value) =>
    String(value || "").trim().toLowerCase();

const normalizeEmployeeId = (value) =>
    String(value || "").trim().toUpperCase();

const cleanString = (value) =>
    typeof value === "string" ? value.trim() : "";

const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);

const getSessionUser = (req) => req.session?.user || {};

const getSessionUserId = (req) => {
    const user = getSessionUser(req);
    return user._id || user.id || user.userId || null;
};

const getSessionRole = (req) =>
    String(getSessionUser(req).role || "").toUpperCase();

const isHrUser = (req, dbUser = null) => {
    const role = String(dbUser?.role || getSessionRole(req)).toUpperCase();
    return HR_ROLES.includes(role);
};

const getOrgIdFromSession = (req) => {
    const user = getSessionUser(req);

    return (
        user.organization?._id ||
        user.organization ||
        user.organizationId?._id ||
        user.organizationId ||
        user.organizationID?._id ||
        user.organizationID ||
        null
    );
};

const getEmployeeIdFromSession = (req) => {
    const user = getSessionUser(req);

    return (
        user.employee?._id ||
        user.employee ||
        user.employeeId?._id ||
        user.employeeId ||
        null
    );
};

const parseDate = (value) => {
    if (!value) return null;

    const input = String(value).trim();

    // Accept date-only form values such as 2026-10-16.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        return null;
    }

    const date = new Date(`${input}T00:00:00.000Z`);

    if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== input
    ) {
        return null;
    }

    return date;
};

const dateToInput = (value) => {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toISOString().slice(0, 10);
};

const getFormValue = (body, ...keys) => {
    for (const key of keys) {
        if (
            body[key] !== undefined &&
            body[key] !== null &&
            body[key] !== ""
        ) {
            return body[key];
        }
    }

    return "";
};

const getEmployeePayload = (body = {}) => ({
    employeeId: normalizeEmployeeId(body.employeeId),
    firstName: cleanString(body.firstName),
    lastName: cleanString(body.lastName),
    email: normalizeEmail(body.email),
    phone: cleanString(body.phone),
    gender: cleanString(body.gender),
    dateOfBirth: parseDate(body.dateOfBirth),

    department: getFormValue(body, "departmentId", "department"),
    designation: getFormValue(body, "designationId", "designation"),
    branch: getFormValue(body, "branchId", "branch"),
    location: getFormValue(body, "locationId", "location"),

    joiningDate: parseDate(body.joiningDate),
    employmentType: cleanString(body.employmentType) || "Permanent",
    reportingManager: cleanString(body.reportingManager),
    status: cleanString(body.status) || "Active",
    address: cleanString(body.address)
});

const getEmployeeFormValues = (employee = {}) => ({
    ...employee,
    employeeId: employee.employeeId || "",
    firstName: employee.firstName || "",
    lastName: employee.lastName || "",
    email: employee.email || "",
    phone: employee.phone || "",
    gender: employee.gender || "",
    dateOfBirth: dateToInput(employee.dateOfBirth),
    department: employee.department?._id || employee.department || "",
    designation: employee.designation?._id || employee.designation || "",
    branch: employee.branch?._id || employee.branch || "",
    location: employee.location?._id || employee.location || "",
    joiningDate: dateToInput(employee.joiningDate),
    employmentType: employee.employmentType || "Permanent",
    reportingManager: employee.reportingManager || "",
    status: employee.status || "Active",
    address: employee.address || ""
});

// =====================================================
// DATABASE USER / ORGANIZATION
// =====================================================

const getDatabaseUser = async (req) => {
    const userId = getSessionUserId(req);

    if (!userId || !isValidObjectId(userId)) {
        return null;
    }

    return User.findById(userId)
        .select("_id name email organization employee role status")
        .lean();
};

const getCurrentOrganization = async (req) => {
    const dbUser = await getDatabaseUser(req);

    // Prefer the organization linked to the authenticated DB user.
    const organizationId =
        dbUser?.organization || getOrgIdFromSession(req);

    if (!organizationId || !isValidObjectId(organizationId)) {
        return null;
    }

    return Organization.findById(organizationId);
};

const getOrganizationId = (organization) =>
    organization?._id || organization || null;

// =====================================================
// EMPLOYEE FORM VALIDATION
// =====================================================

const validateEmployeeFields = (data, { isUpdate = false } = {}) => {
    const errors = [];

    if (!isUpdate || data.employeeId !== "") {
        if (!data.employeeId) {
            errors.push("Employee ID is required.");
        } else if (
            data.employeeId.length > 50 ||
            !EMPLOYEE_ID_REGEX.test(data.employeeId)
        ) {
            errors.push(
                "Employee ID may contain letters, numbers, hyphens and underscores only (maximum 50 characters)."
            );
        }
    }

    if (!data.firstName) {
        errors.push("First name is required.");
    }

    if (data.firstName.length > 100) {
        errors.push("First name cannot exceed 100 characters.");
    }

    if (data.lastName.length > 100) {
        errors.push("Last name cannot exceed 100 characters.");
    }

    if (!data.email || !EMAIL_REGEX.test(data.email)) {
        errors.push("Enter a valid email address.");
    }

    if (data.email.length > 254) {
        errors.push("Email address is too long.");
    }

    if (data.phone.length > 30) {
        errors.push("Phone number cannot exceed 30 characters.");
    }

    if (
        data.gender &&
        !["Male", "Female", "Other"].includes(data.gender)
    ) {
        errors.push("Select a valid gender.");
    }

    if (data.dateOfBirth) {
        if (!parseDate(cleanString(data.dateOfBirth) || dateToInput(data.dateOfBirth))) {
            // The parsed payload normally contains a Date object.
            if (!(data.dateOfBirth instanceof Date)) {
                errors.push("Enter a valid date of birth.");
            }
        }

        if (new Date(data.dateOfBirth).getTime() > Date.now()) {
            errors.push("Date of birth cannot be in the future.");
        }
    }

    if (
        data.joiningDate &&
        !(data.joiningDate instanceof Date) &&
        !parseDate(data.joiningDate)
    ) {
        errors.push("Enter a valid joining date.");
    }

    if (!EMPLOYMENT_TYPES.includes(data.employmentType)) {
        errors.push("Select a valid employment type.");
    }

    if (!EMPLOYEE_STATUSES.includes(data.status)) {
        errors.push("Select a valid employee status.");
    }

    if (data.address.length > 2000) {
        errors.push("Address cannot exceed 2000 characters.");
    }

    return errors;
};

// =====================================================
// DEPARTMENT / DESIGNATION / BRANCH / LOCATION
// =====================================================

const validateEmployeeReferences = async (data, organizationId) => {
    const errors = [];

    const validateScopedReference = async ({
        value,
        Model,
        label
    }) => {
        if (!value) return null;

        if (!isValidObjectId(value)) {
            errors.push(`Select a valid ${label.toLowerCase()}.`);
            return null;
        }

        // Department and Designation use organizationId in their schemas.
        const record = await Model.findOne({
            _id: value,
            organizationId,
            status: "Active"
        }).select("_id name");

        if (!record) {
            errors.push(
                `Selected ${label.toLowerCase()} was not found, is inactive, or belongs to another organization.`
            );
        }

        return record;
    };

    const validateGlobalReference = async ({
        value,
        Model,
        label
    }) => {
        if (!value) return null;

        if (!isValidObjectId(value)) {
            errors.push(`Select a valid ${label.toLowerCase()}.`);
            return null;
        }

        // Branch and Location schemas do not contain an organization field.
        const record = await Model.findOne({
            _id: value,
            status: "Active"
        }).select("_id name");

        if (!record) {
            errors.push(
                `Selected ${label.toLowerCase()} was not found or is inactive.`
            );
        }

        return record;
    };

    await validateScopedReference({
        value: data.department,
        Model: Department,
        label: "Department"
    });

    await validateScopedReference({
        value: data.designation,
        Model: Designation,
        label: "Designation"
    });

    await validateGlobalReference({
        value: data.branch,
        Model: Branch,
        label: "Branch"
    });

    await validateGlobalReference({
        value: data.location,
        Model: Location,
        label: "Location"
    });

    return errors;
};

const getEmployeeFormOptions = async (organizationId) => {
    const [departments, designations, branches, locations] =
        await Promise.all([
            Department.find({
                organizationId,
                status: "Active"
            })
                .select("_id name code")
                .sort({ name: 1 })
                .lean(),

            Designation.find({
                organizationId,
                status: "Active"
            })
                .select("_id name code level")
                .sort({ name: 1 })
                .lean(),

            Branch.find({ status: "Active" })
                .select("_id name code city state")
                .sort({ name: 1 })
                .lean(),

            Location.find({ status: "Active" })
                .select("_id name city address")
                .sort({ name: 1 })
                .lean()
        ]);

    return {
        departments,
        designations,
        branches,
        locations,
        employmentTypes: EMPLOYMENT_TYPES,
        employeeStatuses: EMPLOYEE_STATUSES
    };
};

const renderEmployeeForm = async ({
    req,
    res,
    organization,
    view,
    title,
    employee = {},
    errors = [],
    formData = {}
}) => {
    try {
        const organizationId = getOrganizationId(organization);

        const options = await getEmployeeFormOptions(organizationId);

        return res.status(errors.length ? 400 : 200).render(view, {
            title,
            employee: getEmployeeFormValues(employee),
            formData,
            errors,
            error: errors[0] || null,
            ...options
        });
    } catch (error) {
        console.error("Employee form loading error:", error);

        return res.status(500).send(
            "Unable to load the employee form. Please check the server logs."
        );
    }
};

// =====================================================
// LEAVE BALANCE INITIALIZATION
// =====================================================

const getCurrentYear = () => new Date().getFullYear();

const initializeLeaveBalances = async (employee, organizationId) => {
    const year = getCurrentYear();

    const leaveTypes = await LeaveType.find({
        organization: organizationId,
        status: "Active"
    }).select("_id annualLimit");

    for (const leaveType of leaveTypes) {
        await LeaveBalance.updateOne(
            {
                organization: organizationId,
                employee: employee._id,
                leaveType: leaveType._id,
                year
            },
            {
                $setOnInsert: {
                    organization: organizationId,
                    employee: employee._id,
                    leaveType: leaveType._id,
                    year,
                    allocated: Number(leaveType.annualLimit || 0),
                    carriedForward: 0,
                    used: 0,
                    adjustment: 0,
                    status: "Active"
                }
            },
            { upsert: true }
        );
    }
};

// =====================================================
// POPULATE EMPLOYEE
// =====================================================

const populateEmployee = (query) =>
    query
        .populate("department", "name code")
        .populate("designation", "name code level")
        .populate("branch", "name code city state")
        .populate("location", "name city address");

// =====================================================
// EMPLOYEE ACCESS CONTROL
// =====================================================

const canViewEmployee = async (req, employee, dbUser) => {
    if (isHrUser(req, dbUser)) return true;

    const linkedEmployeeId =
        dbUser?.employee || getEmployeeIdFromSession(req);

    if (
        linkedEmployeeId &&
        isValidObjectId(linkedEmployeeId) &&
        String(linkedEmployeeId) === String(employee._id)
    ) {
        return true;
    }

    // Fallback for older sessions/accounts without a linked employee ref.
    const sessionEmail = normalizeEmail(getSessionUser(req).email);

    return Boolean(
        sessionEmail &&
        sessionEmail === normalizeEmail(employee.email)
    );
};

// =====================================================
// 1. GET EMPLOYEE DIRECTORY
// GET /employees
// =====================================================

exports.getEmployees = asyncHandler(async (req, res) => {
    const organization = await getCurrentOrganization(req);

    if (!organization) {
        return res.status(400).send(
            "Your account is not linked to a valid organization."
        );
    }

    const organizationId = getOrganizationId(organization);

    const search = cleanString(req.query.search);
    const status = cleanString(req.query.status);
    const departmentId = cleanString(req.query.department);

    const page = Math.max(
        1,
        parseInt(req.query.page, 10) || 1
    );

    const limit = 20;

    const filter = { organization: organizationId };

    if (status && EMPLOYEE_STATUSES.includes(status)) {
        filter.status = status;
    }

    if (departmentId && isValidObjectId(departmentId)) {
        filter.department = departmentId;
    }

    if (search) {
        const escapedSearch = search.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

        const regex = new RegExp(escapedSearch, "i");

        filter.$or = [
            { employeeId: regex },
            { firstName: regex },
            { lastName: regex },
            { email: regex },
            { phone: regex }
        ];
    }

    const [employees, total, active, onLeave, exited, options] =
        await Promise.all([
            populateEmployee(
                Employee.find(filter)
                    .sort({ createdAt: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit)
            ).lean(),

            Employee.countDocuments({ organization: organizationId }),

            Employee.countDocuments({
                organization: organizationId,
                status: "Active"
            }),

            Employee.countDocuments({
                organization: organizationId,
                status: "On Leave"
            }),

            Employee.countDocuments({
                organization: organizationId,
                status: "Exited"
            }),

            getEmployeeFormOptions(organizationId)
        ]);

    return res.render("employees/index", {
        title: "Employee Directory",
        employees,
        search,
        status,
        department: departmentId,
        departments: options.departments,
        stats: {
            total,
            active,
            onLeave,
            exited
        },
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(
                (await Employee.countDocuments(filter)) / limit
            ))
        }
    });
});

// =====================================================
// 2. GET CREATE EMPLOYEE FORM
// GET /employees/create
// =====================================================

exports.getCreateEmployee = asyncHandler(async (req, res) => {
    const organization = await getCurrentOrganization(req);

    if (!organization) {
        return res.status(400).send(
            "Your account is not linked to a valid organization."
        );
    }

    return renderEmployeeForm({
        req,
        res,
        organization,
        view: "employees/create",
        title: "Add New Employee",
        employee: {
            status: "Active",
            employmentType: "Permanent"
        }
    });
});

// =====================================================
// 3. CREATE EMPLOYEE
// POST /employees/create
// =====================================================

exports.createEmployee = asyncHandler(async (req, res) => {
    const organization = await getCurrentOrganization(req);

    if (!organization) {
        return res.status(400).send(
            "Your account is not linked to a valid organization."
        );
    }

    const organizationId = getOrganizationId(organization);
    const data = getEmployeePayload(req.body);

    let errors = validateEmployeeFields(data);

    if (errors.length) {
        return renderEmployeeForm({
            req,
            res,
            organization,
            view: "employees/create",
            title: "Add New Employee",
            employee: data,
            errors,
            formData: req.body
        });
    }

    const referenceErrors = await validateEmployeeReferences(
        data,
        organizationId
    );

    if (referenceErrors.length) {
        return renderEmployeeForm({
            req,
            res,
            organization,
            view: "employees/create",
            title: "Add New Employee",
            employee: data,
            errors: referenceErrors,
            formData: req.body
        });
    }

    const duplicateEmployeeId = await Employee.findOne({
        organization: organizationId,
        employeeId: data.employeeId
    }).select("_id");

    if (duplicateEmployeeId) {
        return renderEmployeeForm({
            req,
            res,
            organization,
            view: "employees/create",
            title: "Add New Employee",
            employee: data,
            errors: ["This Employee ID is already in use."],
            formData: req.body
        });
    }

    const duplicateEmployeeEmail = await Employee.findOne({
        organization: organizationId,
        email: data.email
    }).select("_id");

    if (duplicateEmployeeEmail) {
        return renderEmployeeForm({
            req,
            res,
            organization,
            view: "employees/create",
            title: "Add New Employee",
            employee: data,
            errors: ["An employee with this email already exists in your organization."],
            formData: req.body
        });
    }

    // User.email is globally unique in the supplied User schema.
    // Never attach an existing account to another employee automatically.
    const duplicateUser = await User.findOne({
        email: data.email
    }).select("_id");

    if (duplicateUser) {
        return renderEmployeeForm({
            req,
            res,
            organization,
            view: "employees/create",
            title: "Add New Employee",
            employee: data,
            errors: [
                "A login account already uses this email address. Use a different email or resolve the existing account first."
            ],
            formData: req.body
        });
    }

    const employeeData = {
        organization: organizationId,
        employeeId: data.employeeId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        gender: data.gender || "",
        department: data.department || null,
        designation: data.designation || null,
        branch: data.branch || null,
        location: data.location || null,
        joiningDate: data.joiningDate || undefined,
        employmentType: data.employmentType,
        reportingManager: data.reportingManager,
        status: data.status,
        address: data.address
    };

    if (data.dateOfBirth) {
        employeeData.dateOfBirth = data.dateOfBirth;
    }

    const employee = await Employee.create(employeeData);

    // Leave balance setup must not depend on whether email delivery works.
    try {
        await initializeLeaveBalances(employee, organizationId);
    } catch (error) {
        console.error(
            `Leave balance initialization failed for employee ${employee._id}:`,
            error
        );
    }

    // Create an invitation account if a base URL is configured.
    // If email delivery fails, preserve the employee and report the issue.
    const baseUrl = String(process.env.APP_BASE_URL || "").replace(/\/+$/, "");
    let setupWarning = null;
    let invitationSent = false;

    if (!baseUrl) {
        setupWarning =
            "Employee created, but the login invitation was not created because APP_BASE_URL is missing.";
    } else {
        try {
            const rawToken = crypto.randomBytes(32).toString("hex");
            const tokenHash = crypto
                .createHash("sha256")
                .update(rawToken)
                .digest("hex");

            const temporaryPassword = crypto.randomBytes(32).toString("hex");
            const passwordHash = await bcrypt.hash(temporaryPassword, 12);

            const user = await User.create({
                name: `${data.firstName} ${data.lastName}`.trim(),
                email: data.email,
                password: passwordHash,
                organization: organizationId,
                employee: employee._id,
                role: "EMPLOYEE",
                status: "INACTIVE",
                invitationTokenHash: tokenHash,
                invitationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });

            // Change this path if your invitation acceptance route differs.
            const invitationUrl =
                `${baseUrl}/accept-invitation?token=${encodeURIComponent(rawToken)}`;

            const employeeName = escapeHtml(
                `${data.firstName} ${data.lastName}`.trim()
            );

            const subject = "Your Gyansify HRMS account invitation";

            const text = [
                `Hello ${data.firstName},`,
                "",
                "Your employee profile has been created in Gyansify HRMS.",
                "Use the following link to accept your invitation and set up your account:",
                invitationUrl,
                "",
                "This invitation link expires in 24 hours.",
                "",
                "Regards,",
                "Gyansify HRMS"
            ].join("\n");

            const html = `
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
                    <h2>Welcome to Gyansify HRMS</h2>
                    <p>Hello ${employeeName},</p>
                    <p>Your employee profile has been created.</p>
                    <p>Use the button below to accept your invitation and set up your account.</p>
                    <p>
                        <a href="${escapeHtml(invitationUrl)}"
                           style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px">
                           Accept Invitation
                        </a>
                    </p>
                    <p>This invitation link expires in 24 hours.</p>
                    <p>Regards,<br>Gyansify HRMS</p>
                </div>
            `;

            try {
                await sendEmail({
                    to: data.email,
                    subject,
                    text,
                    html
                });

                invitationSent = true;
            } catch (emailError) {
                console.error(
                    `Invitation email failed for user ${user._id}:`,
                    emailError.message
                );

                setupWarning =
                    "Employee and login account created, but the invitation email could not be sent. Check EMAIL_* settings and SMTP logs, then resend the invitation.";
            }
        } catch (accountError) {
            console.error(
                `Employee login account setup failed for ${employee._id}:`,
                accountError
            );

            setupWarning =
                "Employee profile created, but the login account could not be created. Check the server logs before retrying.";
        }
    }

    req.session.flash = {
        type: setupWarning ? "warning" : "success",
        message: setupWarning ||
            (invitationSent
                ? "Employee created successfully. The login invitation has been sent."
                : "Employee created successfully.")
    };

    return res.redirect(`/employees/${employee._id}`);
});

// =====================================================
// 4. GET EMPLOYEE PROFILE
// GET /employees/:id OR /employees/me
// =====================================================

exports.getEmployee = asyncHandler(async (req, res) => {
    const organization = await getCurrentOrganization(req);

    if (!organization) {
        return res.status(400).send(
            "Your account is not linked to a valid organization."
        );
    }

    const organizationId = getOrganizationId(organization);
    const dbUser = await getDatabaseUser(req);

    let employee;

    if (req.params.id === undefined || req.params.id === "me") {
        const linkedEmployeeId =
            dbUser?.employee || getEmployeeIdFromSession(req);

        if (linkedEmployeeId && isValidObjectId(linkedEmployeeId)) {
            employee = await populateEmployee(
                Employee.findOne({
                    _id: linkedEmployeeId,
                    organization: organizationId
                })
            ).lean();
        }

        if (!employee) {
            const email = normalizeEmail(
                dbUser?.email || getSessionUser(req).email
            );

            if (email) {
                employee = await populateEmployee(
                    Employee.findOne({
                        organization: organizationId,
                        email
                    })
                ).lean();
            }
        }
    } else {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).send("Invalid employee ID.");
        }

        employee = await populateEmployee(
            Employee.findOne({
                _id: req.params.id,
                organization: organizationId
            })
        ).lean();
    }

    if (!employee) {
        return res.status(404).send("Employee not found.");
    }

    if (!(await canViewEmployee(req, employee, dbUser))) {
        return res.status(403).send(
            "You are not authorized to view this employee."
        );
    }

    const linkedUser = await User.findOne({
        employee: employee._id,
        organization: organizationId
    })
        .select("_id name email role status createdAt")
        .lean();

    return res.render("employees/profile", {
        title: "Employee Profile",
        employee,
        linkedUser,
        currentUser: getSessionUser(req),
        setupWarning: req.query.warning || null,
        flash: req.session.flash || null
    });
});

// =====================================================
// 5. GET EDIT EMPLOYEE FORM
// GET /employees/:id/edit
// =====================================================

exports.getEditEmployee = asyncHandler(async (req, res) => {
    const organization = await getCurrentOrganization(req);

    if (!organization) {
        return res.status(400).send(
            "Your account is not linked to a valid organization."
        );
    }

    const organizationId = getOrganizationId(organization);

    const employee = await Employee.findOne({
        _id: req.params.id,
        organization: organizationId
    }).lean();

    if (!employee) {
        return res.status(404).send("Employee not found.");
    }

    return renderEmployeeForm({
        req,
        res,
        organization,
        view: "employees/edit",
        title: "Edit Employee",
        employee
    });
});

// =====================================================
// 6. UPDATE EMPLOYEE
// POST /employees/:id/edit
// =====================================================

exports.updateEmployee = asyncHandler(async (req, res) => {
    const organization = await getCurrentOrganization(req);

    if (!organization) {
        return res.status(400).send(
            "Your account is not linked to a valid organization."
        );
    }

    const organizationId = getOrganizationId(organization);

    const employee = await Employee.findOne({
        _id: req.params.id,
        organization: organizationId
    });

    if (!employee) {
        return res.status(404).send("Employee not found.");
    }

    const data = getEmployeePayload(req.body);

    // Employee ID is required by the schema; preserve it if the edit form
    // does not submit the field.
    if (!data.employeeId) {
        data.employeeId = employee.employeeId;
    }

    const errors = validateEmployeeFields(data, { isUpdate: true });

    if (errors.length) {
        return renderEmployeeForm({
            req,
            res,
            organization,
            view: "employees/edit",
            title: "Edit Employee",
            employee: { ...employee.toObject(), ...data },
            errors,
            formData: req.body
        });
    }

    const referenceErrors = await validateEmployeeReferences(
        data,
        organizationId
    );

    if (referenceErrors.length) {
        return renderEmployeeForm({
            req,
            res,
            organization,
            view: "employees/edit",
            title: "Edit Employee",
            employee: { ...employee.toObject(), ...data },
            errors: referenceErrors,
            formData: req.body
        });
    }

    const duplicateEmployeeId = await Employee.findOne({
        organization: organizationId,
        employeeId: data.employeeId,
        _id: { $ne: employee._id }
    }).select("_id");

    if (duplicateEmployeeId) {
        return renderEmployeeForm({
            req,
            res,
            organization,
            view: "employees/edit",
            title: "Edit Employee",
            employee: { ...employee.toObject(), ...data },
            errors: ["This Employee ID is already in use."],
            formData: req.body
        });
    }

    const duplicateEmployeeEmail = await Employee.findOne({
        organization: organizationId,
        email: data.email,
        _id: { $ne: employee._id }
    }).select("_id");

    if (duplicateEmployeeEmail) {
        return renderEmployeeForm({
            req,
            res,
            organization,
            view: "employees/edit",
            title: "Edit Employee",
            employee: { ...employee.toObject(), ...data },
            errors: ["Another employee already uses this email address."],
            formData: req.body
        });
    }

    const linkedUser = await User.findOne({
        employee: employee._id,
        organization: organizationId
    });

    if (linkedUser) {
        const duplicateUser = await User.findOne({
            email: data.email,
            _id: { $ne: linkedUser._id }
        }).select("_id");

        if (duplicateUser) {
            return renderEmployeeForm({
                req,
                res,
                organization,
                view: "employees/edit",
                title: "Edit Employee",
                employee: { ...employee.toObject(), ...data },
                errors: [
                    "This email address is already assigned to another login account."
                ],
                formData: req.body
            });
        }

        linkedUser.name =
            `${data.firstName} ${data.lastName}`.trim();
        linkedUser.email = data.email;

        await linkedUser.save();
    }

    employee.employeeId = data.employeeId;
    employee.firstName = data.firstName;
    employee.lastName = data.lastName;
    employee.email = data.email;
    employee.phone = data.phone;
    employee.gender = data.gender || "";
    employee.dateOfBirth = data.dateOfBirth || undefined;
    employee.department = data.department || null;
    employee.designation = data.designation || null;
    employee.branch = data.branch || null;
    employee.location = data.location || null;
    employee.joiningDate = data.joiningDate || undefined;
    employee.employmentType = data.employmentType;
    employee.reportingManager = data.reportingManager;
    employee.status = data.status;
    employee.address = data.address;

    await employee.save();

    if (linkedUser && data.status === "Exited") {
        linkedUser.status = "INACTIVE";
        await linkedUser.save();
    }

    req.session.flash = {
        type: "success",
        message: "Employee details updated successfully."
    };

    return res.redirect(`/employees/${employee._id}`);
});

// =====================================================
// 7. DELETE / EXIT EMPLOYEE
// POST /employees/:id/delete
// =====================================================

exports.deleteEmployee = asyncHandler(async (req, res) => {
    const organization = await getCurrentOrganization(req);

    if (!organization) {
        return res.status(400).send(
            "Your account is not linked to a valid organization."
        );
    }

    const organizationId = getOrganizationId(organization);

    const employee = await Employee.findOne({
        _id: req.params.id,
        organization: organizationId
    });

    if (!employee) {
        return res.status(404).send("Employee not found.");
    }

    // Preserve employee and payroll/history references instead of hard deleting.
    employee.status = "Exited";
    await employee.save();

    await User.updateOne(
        {
            employee: employee._id,
            organization: organizationId
        },
        {
            $set: {
                status: "INACTIVE"
            }
        }
    );

    req.session.flash = {
        type: "success",
        message: "Employee marked as Exited and linked login account deactivated."
    };

    return res.redirect("/employees");
});

// =====================================================
// OPTIONAL EXPORTS FOR TESTING
// =====================================================

exports.validateEmployeeFields = validateEmployeeFields;
exports.validateEmployeeReferences = validateEmployeeReferences;
exports.initializeLeaveBalances = initializeLeaveBalances;
