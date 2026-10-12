
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
// CONSTANTS
// =====================================================

const HR_ROLES = [
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE"
];

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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

// =====================================================
// COMMON HELPERS
// =====================================================

const isValidObjectId = (value) =>
    typeof value === "string" &&
    OBJECT_ID_PATTERN.test(value);

const normalizeId = (value) => {
    if (!value) return "";

    if (typeof value === "object" && value._id) {
        return String(value._id);
    }

    return String(value);
};

const normalizeEmail = (value) =>
    String(value || "").trim().toLowerCase();

const normalizeEmployeeId = (value) =>
    String(value || "").trim().toUpperCase();

const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);

const getSessionUser = (req) =>
    req.session?.user || null;

const getSessionUserId = (req) => {
    const user = getSessionUser(req);

    return normalizeId(user?._id || user?.id);
};

const hasPath = (Model, path) =>
    Boolean(Model?.schema?.path(path));

const firstPath = (Model, paths) =>
    paths.find((path) => hasPath(Model, path)) || null;

const getOrganizationField = (Model) =>
    firstPath(Model, [
        "organization",
        "organizationId",
        "organizationID"
    ]);

const getEmployeeReferenceField = (Model) =>
    firstPath(Model, [
        "employee",
        "employeeId"
    ]);

const getDbUser = async (req) => {
    const userId = getSessionUserId(req);

    if (!isValidObjectId(userId)) {
        return null;
    }

    return User.findById(userId).exec();
};

const getDbUserOrganizationId = (dbUser) => {
    if (!dbUser) return "";

    const field = getOrganizationField(User);

    return field
        ? normalizeId(dbUser[field])
        : "";
};

const isHrUser = (user) => {
    const role = String(
        user?.role || ""
    ).toUpperCase();

    return HR_ROLES.includes(role);
};

const getSessionRole = (req) =>
    String(
        getSessionUser(req)?.role || "EMPLOYEE"
    ).toUpperCase();

const escapeRegex = (value) =>
    String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const asyncHandler = (handler) =>
    async (req, res, next) => {
        try {
            await handler(req, res, next);
        } catch (error) {
            next(error);
        }
    };

// =====================================================
// ORGANIZATION
// =====================================================

const getCurrentOrganization = async (req) => {
    const dbUser = await getDbUser(req);

    const dbOrganizationId =
        getDbUserOrganizationId(dbUser);

    const sessionUser = getSessionUser(req);

    const sessionOrganizationId = normalizeId(
        sessionUser?.organizationId ||
        sessionUser?.organization?._id ||
        sessionUser?.organization ||
        sessionUser?.organizationID ||
        req.session?.organizationId
    );

    // Prefer the organization stored in the database.
    // Never use a different session organization when
    // the database account already has an organization.
    const organizationId =
        dbOrganizationId || sessionOrganizationId;

    if (!isValidObjectId(organizationId)) {
        return null;
    }

    return Organization.findById(organizationId);
};

const getOrganizationOrRespond = async (req, res) => {
    const organization = await getCurrentOrganization(req);

    if (!organization) {
        res.status(401).send(
            "Organization not found. Please log in again."
        );

        return null;
    }

    return organization;
};

// =====================================================
// REFERENCE HELPERS
// =====================================================

const getReferenceFilter = (Model, organizationId) => {
    const filter = {};

    if (hasPath(Model, "status")) {
        filter.status = {
            $in: ["Active", "ACTIVE", "active"]
        };
    } else if (hasPath(Model, "isActive")) {
        filter.isActive = true;
    }

    const organizationField =
        getOrganizationField(Model);

    if (organizationField) {
        filter[organizationField] = organizationId;
    }

    return filter;
};

const getActiveReferenceOptions = async (
    Model,
    organizationId
) => {
    const filter = getReferenceFilter(
        Model,
        organizationId
    );

    return Model.find(filter)
        .sort({ name: 1, _id: 1 })
        .lean();
};

const validateReference = async (
    Model,
    value,
    organizationId,
    fieldName
) => {
    if (!value) return null;

    const id = String(value);

    if (!isValidObjectId(id)) {
        throw new Error(
            `Invalid ${fieldName} selection.`
        );
    }

    const filter = {
        _id: id
    };

    if (hasPath(Model, "status")) {
        filter.status = {
            $in: ["Active", "ACTIVE", "active"]
        };
    } else if (hasPath(Model, "isActive")) {
        filter.isActive = true;
    }

    const organizationField =
        getOrganizationField(Model);

    if (organizationField) {
        filter[organizationField] = organizationId;
    }

    const document = await Model.findOne(filter).lean();

    if (!document) {
        throw new Error(
            `Selected ${fieldName} was not found or is inactive.`
        );
    }

    return document._id;
};

const validateEmployeeReferences = async (
    body,
    organization
) => {
    const [
        department,
        designation,
        branch,
        location
    ] = await Promise.all([
        validateReference(
            Department,
            body.department,
            organization._id,
            "department"
        ),
        validateReference(
            Designation,
            body.designation,
            organization._id,
            "designation"
        ),
        validateReference(
            Branch,
            body.branch,
            organization._id,
            "branch"
        ),
        validateReference(
            Location,
            body.location,
            organization._id,
            "location"
        )
    ]);

    return {
        department,
        designation,
        branch,
        location
    };
};

// =====================================================
// FORM RENDERING
// =====================================================

const renderEmployeeForm = async (
    res,
    req,
    organization,
    options = {}
) => {
    const [
        departments,
        designations,
        branches,
        locations
    ] = await Promise.all([
        getActiveReferenceOptions(
            Department,
            organization._id
        ),
        getActiveReferenceOptions(
            Designation,
            organization._id
        ),
        getActiveReferenceOptions(
            Branch,
            organization._id
        ),
        getActiveReferenceOptions(
            Location,
            organization._id
        )
    ]);

    return res.status(options.statusCode || 200).render(
        options.view || "employees/create",
        {
            title: options.title || "Add Employee",
            user: getSessionUser(req) || {},
            organization,
            organizationId: String(organization._id),
            departments,
            designations,
            branches,
            locations,
            formData: options.formData || {},
            employee: options.employee || null,
            error: options.error || null,
            success: options.success || null
        }
    );
};

// =====================================================
// DATE HELPERS
// =====================================================

const parseOptionalDate = (value, label) => {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const stringValue = String(value);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
        throw new Error(`Invalid ${label}.`);
    }

    const [year, month, day] = stringValue
        .split("-")
        .map(Number);

    const date = new Date(
        Date.UTC(year, month - 1, day)
    );

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        throw new Error(`Invalid ${label}.`);
    }

    return date;
};

const getIndiaYear = () =>
    Number(
        new Intl.DateTimeFormat("en", {
            timeZone: "Asia/Kolkata",
            year: "numeric"
        }).format(new Date())
    );

// =====================================================
// LEAVE BALANCES
// =====================================================

const createEmployeeLeaveBalances = async (
    employee,
    organization
) => {
    if (!employee || !organization) {
        return;
    }

    const organizationField =
        getOrganizationField(LeaveType);

    if (!organizationField) {
        throw new Error(
            "LeaveType schema has no organization field."
        );
    }

    const leaveTypes = await LeaveType.find({
        [organizationField]: organization._id,
        ...getReferenceFilter(
            LeaveType,
            organization._id
        )
    }).lean();

    const balanceOrganizationField =
        getOrganizationField(LeaveBalance);

    const balanceEmployeeField =
        getEmployeeReferenceField(LeaveBalance);

    if (
        !balanceOrganizationField ||
        !balanceEmployeeField ||
        !hasPath(LeaveBalance, "leaveType") ||
        !hasPath(LeaveBalance, "year")
    ) {
        throw new Error(
            "LeaveBalance schema does not contain the required reference fields."
        );
    }

    const year = getIndiaYear();

    for (const leaveType of leaveTypes) {
        const filter = {
            [balanceOrganizationField]: organization._id,
            [balanceEmployeeField]: employee._id,
            leaveType: leaveType._id,
            year
        };

        const update = {
            $setOnInsert: {
                ...filter,
                allocated: Number(
                    leaveType.annualLimit || 0
                ),
                carriedForward: 0,
                used: 0,
                adjustment: 0
            }
        };

        await LeaveBalance.updateOne(
            filter,
            update,
            {
                upsert: true,
                runValidators: true
            }
        );
    }
};

// =====================================================
// EMPLOYEE POPULATION
// =====================================================

const populateEmployee = (query) =>
    query
        .populate("department", "name code")
        .populate("designation", "name code level")
        .populate("branch", "name code city state")
        .populate("location", "name city");

// =====================================================
// GET ALL EMPLOYEES
// GET /employees
// =====================================================

exports.getEmployees = asyncHandler(
    async (req, res) => {
        const organization =
            await getOrganizationOrRespond(req, res);

        if (!organization) return;

        const search = String(
            req.query.search || ""
        ).trim();

        const status = String(
            req.query.status || ""
        ).trim();

        const department = String(
            req.query.department || ""
        ).trim();

        const designation = String(
            req.query.designation || ""
        ).trim();

        const allowedLimits = [10, 25, 50, 100];

        const parsedPage = Number.parseInt(
            req.query.page,
            10
        );

        const parsedLimit = Number.parseInt(
            req.query.limit,
            10
        );

        const page =
            Number.isInteger(parsedPage) && parsedPage > 0
                ? parsedPage
                : 1;

        const limit = allowedLimits.includes(parsedLimit)
            ? parsedLimit
            : 25;

        const baseFilter = {
            organization: organization._id
        };

        const filter = {
            ...baseFilter
        };

        if (search) {
            const regex = new RegExp(
                escapeRegex(search),
                "i"
            );

            filter.$or = [
                { employeeId: regex },
                { firstName: regex },
                { lastName: regex },
                { email: regex }
            ];
        }

        if (
            status &&
            EMPLOYEE_STATUSES.includes(status)
        ) {
            filter.status = status;
        }

        if (department) {
            if (!isValidObjectId(department)) {
                return res.status(400).send(
                    "Invalid department filter."
                );
            }

            filter.department = department;
        }

        if (designation) {
            if (!isValidObjectId(designation)) {
                return res.status(400).send(
                    "Invalid designation filter."
                );
            }

            filter.designation = designation;
        }

        const skip = (page - 1) * limit;

        const [
            employees,
            totalFiltered,
            total,
            active,
            onLeave,
            noticePeriod,
            suspended,
            exited,
            departments,
            designations
        ] = await Promise.all([
            populateEmployee(
                Employee.find(filter)
            )
                .sort({ createdAt: -1, _id: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),

            Employee.countDocuments(filter),

            Employee.countDocuments(baseFilter),

            Employee.countDocuments({
                ...baseFilter,
                status: "Active"
            }),

            Employee.countDocuments({
                ...baseFilter,
                status: "On Leave"
            }),

            Employee.countDocuments({
                ...baseFilter,
                status: "Notice Period"
            }),

            Employee.countDocuments({
                ...baseFilter,
                status: "Suspended"
            }),

            Employee.countDocuments({
                ...baseFilter,
                status: "Exited"
            }),

            getActiveReferenceOptions(
                Department,
                organization._id
            ),

            getActiveReferenceOptions(
                Designation,
                organization._id
            )
        ]);

        const totalPages = Math.max(
            1,
            Math.ceil(totalFiltered / limit)
        );

        const currentPage = Math.min(
            page,
            totalPages
        );

        const buildPageUrl = (targetPage) => {
            const params = new URLSearchParams();

            if (search) params.set("search", search);
            if (status) params.set("status", status);
            if (department) params.set("department", department);
            if (designation) params.set("designation", designation);

            params.set("page", String(targetPage));
            params.set("limit", String(limit));

            return `/employees?${params.toString()}`;
        };

        const pagination = {
            page: currentPage,
            limit,
            total: totalFiltered,
            totalPages,
            hasPreviousPage: currentPage > 1,
            hasNextPage: currentPage < totalPages,

            previousUrl:
                currentPage > 1
                    ? buildPageUrl(currentPage - 1)
                    : null,

            nextUrl:
                currentPage < totalPages
                    ? buildPageUrl(currentPage + 1)
                    : null,

            start:
                totalFiltered === 0
                    ? 0
                    : (currentPage - 1) * limit + 1,

            end: Math.min(
                currentPage * limit,
                totalFiltered
            )
        };

        return res.render("employees/index", {
            title: "Employees",
            user: getSessionUser(req) || {},
            organization,
            employees,
            departments,
            designations,

            stats: {
                total,
                active,
                onLeave,
                noticePeriod,
                suspended,
                exited
            },

            filters: {
                search,
                status,
                department,
                designation,
                limit
            },

            pagination
        });
    }
);

// =====================================================
// GET CREATE EMPLOYEE
// GET /employees/create
// =====================================================

exports.getCreateEmployee = asyncHandler(
    async (req, res) => {
        const organization =
            await getOrganizationOrRespond(req, res);

        if (!organization) return;

        return renderEmployeeForm(
            res,
            req,
            organization
        );
    }
);

// =====================================================
// CREATE EMPLOYEE
// POST /employees/create
// =====================================================

exports.createEmployee = asyncHandler(
    async (req, res) => {
        const organization =
            await getOrganizationOrRespond(req, res);

        if (!organization) return;

        const body = req.body || {};

        const employeeId = normalizeEmployeeId(
            body.employeeId
        );

        const firstName = String(
            body.firstName || ""
        ).trim();

        const lastName = String(
            body.lastName || ""
        ).trim();

        const email = normalizeEmail(body.email);

        const showFormError = (
            message,
            statusCode = 400
        ) => renderEmployeeForm(
            res,
            req,
            organization,
            {
                statusCode,
                error: message,
                formData: body
            }
        );

        if (!employeeId || !firstName || !email) {
            return showFormError(
                "Employee ID, First Name and Email are required."
            );
        }

        if (!EMAIL_PATTERN.test(email)) {
            return showFormError(
                "Please enter a valid email address."
            );
        }

        if (
            body.gender &&
            !["Male", "Female", "Other"].includes(body.gender)
        ) {
            return showFormError(
                "Please select a valid gender."
            );
        }

        const employmentType =
            body.employmentType || "Permanent";

        if (!EMPLOYMENT_TYPES.includes(employmentType)) {
            return showFormError(
                "Please select a valid employment type."
            );
        }

        const duplicateEmployee = await Employee.findOne({
            organization: organization._id,
            $or: [
                { employeeId },
                { email }
            ]
        }).lean();

        if (duplicateEmployee) {
            const message =
                duplicateEmployee.employeeId === employeeId
                    ? "Employee ID already exists."
                    : "An employee with this email already exists.";

            return showFormError(message, 409);
        }

        // User.email may be globally unique. Do not silently
        // attach an existing login account to another employee.
        const duplicateUser = await User.findOne({
            email
        }).select("_id").lean();

        if (duplicateUser) {
            return showFormError(
                "This email already belongs to a login account. " +
                "Use the account-linking workflow instead.",
                409
            );
        }

        let references;

        try {
            references = await validateEmployeeReferences(
                body,
                organization
            );
        } catch (error) {
            return showFormError(error.message, 400);
        }

        let dateOfBirth;
        let joiningDate;

        try {
            dateOfBirth = parseOptionalDate(
                body.dateOfBirth,
                "date of birth"
            );

            joiningDate = parseOptionalDate(
                body.joiningDate,
                "joining date"
            );
        } catch (error) {
            return showFormError(error.message, 400);
        }

        if (
            dateOfBirth &&
            dateOfBirth.getTime() > Date.now()
        ) {
            return showFormError(
                "Date of birth cannot be in the future."
            );
        }

        // Create the employee first. If account/invitation setup
        // fails, retain the employee record for HR recovery.
        const employee = await Employee.create({
            organization: organization._id,
            employeeId,
            firstName,
            lastName,
            email,
            phone: String(body.phone || "").trim(),
            gender: body.gender || "",
            dateOfBirth,
            department: references.department,
            designation: references.designation,
            branch: references.branch,
            location: references.location,
            joiningDate,
            employmentType,
            reportingManager: String(
                body.reportingManager || ""
            ).trim(),
            address: String(body.address || "").trim(),
            status: "Active"
        });

        let invitationSent = false;

        try {
            // The existing User schema must support these fields.
            // Do not invent a login role or token field here:
            // the exact field names depend on User.js and the
            // existing password-setup controller.
            const userOrganizationField =
                getOrganizationField(User);

            const userEmployeeField =
                getEmployeeReferenceField(User);

            const passwordField = firstPath(User, [
                "passwordHash",
                "password"
            ]);

            if (
                !userOrganizationField ||
                !userEmployeeField ||
                !passwordField
            ) {
                throw new Error(
                    "User schema does not expose the expected organization, " +
                    "employee and password fields. Employee was saved, " +
                    "but the login invitation was not created."
                );
            }

            const token = crypto
                .randomBytes(32)
                .toString("hex");

            const tokenHash = crypto
                .createHash("sha256")
                .update(token)
                .digest("hex");

            const temporaryPassword = crypto
                .randomBytes(48)
                .toString("hex");

            const passwordHash = await bcrypt.hash(
                temporaryPassword,
                12
            );

            const userData = {
                [userOrganizationField]: organization._id,
                [userEmployeeField]: employee._id,
                [passwordField]: passwordHash
            };

            if (hasPath(User, "name")) {
                userData.name = [
                    firstName,
                    lastName
                ].filter(Boolean).join(" ");
            }

            if (hasPath(User, "email")) {
                userData.email = email;
            }

            // Only set a role field if the schema supports a
            // string role. Role-reference arrays need the actual
            // Role model and its organization-specific role ID.
            if (
                hasPath(User, "role") &&
                User.schema.path("role").instance === "String"
            ) {
                userData.role = "EMPLOYEE";
            }

            if (hasPath(User, "status")) {
                const statusPath = User.schema.path("status");

                const allowedStatusValues =
                    statusPath.enumValues || [];

                userData.status =
                    allowedStatusValues.includes("INACTIVE")
                        ? "INACTIVE"
                        : allowedStatusValues.includes("Inactive")
                            ? "Inactive"
                            : "INACTIVE";
            }

            // Support common invitation field names only when
            // they actually exist in the User schema.
            const tokenField = firstPath(User, [
                "invitationTokenHash",
                "setPasswordTokenHash",
                "passwordSetupTokenHash",
                "resetPasswordTokenHash"
            ]);

            const expiryField = firstPath(User, [
                "invitationExpiresAt",
                "setPasswordExpiresAt",
                "passwordSetupExpiresAt",
                "resetPasswordExpiresAt"
            ]);

            if (!tokenField || !expiryField) {
                throw new Error(
                    "User schema does not define a supported password-setup " +
                    "token and expiry pair. Employee was saved, but no " +
                    "login invitation was sent."
                );
            }

            userData[tokenField] = tokenHash;

            userData[expiryField] = new Date(
                Date.now() + INVITATION_TTL_MS
            );

            // Only create a login when the required role field
            // can be set safely. A Role-reference schema must be
            // wired to the actual Role model before account creation.
            const rolePath = User.schema.path("role");
            const rolesPath = User.schema.path("roles");

            if (
                rolesPath &&
                (!rolePath ||
                    rolePath.instance !== "String")
            ) {
                throw new Error(
                    "User uses a role reference/roles array. " +
                    "Assign the actual EMPLOYEE Role document before " +
                    "enabling account invitations."
                );
            }

            const userAccount = await User.create(userData);

            const baseUrl = String(
                process.env.APP_BASE_URL || ""
            ).replace(/\/+$/, "");

            if (!baseUrl) {
                throw new Error(
                    "APP_BASE_URL is missing from the environment. " +
                    "Employee and login records exist, but the invitation " +
                    "email was not sent."
                );
            }

            const invitationUrl =
                `${baseUrl}/auth/set-password` +
                `?token=${encodeURIComponent(token)}` +
                `&email=${encodeURIComponent(email)}`;

            await sendEmail({
                to: email,
                subject:
                    "Welcome to Gyansify HRMS — Set Up Your Account",

                text:
                    `Hello ${firstName},\n\n` +
                    "Your Gyansify HRMS employee record has been created.\n" +
                    `Employee ID: ${employeeId}\n\n` +
                    "Set up your password using this link:\n" +
                    `${invitationUrl}\n\n` +
                    "This invitation expires in 24 hours.\n" +
                    "If you were not expecting this invitation, contact HR.",

                html: `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f2937;line-height:1.6">
                        <h2 style="color:#2563eb">Welcome to Gyansify HRMS</h2>
                        <p>Hello ${escapeHtml(firstName)},</p>
                        <p>Your employee record has been created.</p>
                        <p><strong>Employee ID:</strong> ${escapeHtml(employeeId)}</p>
                        <p>Use the button below to set up your password.</p>
                        <p style="margin:28px 0">
                            <a href="${escapeHtml(invitationUrl)}"
                               style="background:#2563eb;color:#fff;padding:12px 22px;text-decoration:none;border-radius:6px;display:inline-block">
                                Set Up My Password
                            </a>
                        </p>
                        <p>This invitation expires in 24 hours.</p>
                        <p>If you were not expecting this invitation, contact HR.</p>
                        <p>Regards,<br>Gyansify HRMS</p>
                    </div>
                `
            });

            invitationSent = true;

            // Keep the created login available for HR recovery.
            // A failure here must not delete the employee or login.
            try {
                await createEmployeeLeaveBalances(
                    employee,
                    organization
                );
            } catch (balanceError) {
                console.error(
                    "Leave balance setup requires attention:",
                    balanceError
                );
            }

            console.log(
                `Employee created and invitation sent: ${employee.employeeId}`,
                { userId: String(userAccount._id) }
            );

        } catch (setupError) {
            console.error(
                "Employee created, but account/invitation setup failed:",
                setupError
            );

            return res.status(500).render(
                "employees/profile",
                {
                    title: "Employee Created",
                    user: getSessionUser(req) || {},
                    organization,
                    employee,
                    setupWarning:
                        "The employee record was created, but account setup " +
                        "or invitation delivery needs administrator attention. " +
                        "Check the server logs before retrying."
                }
            );
        }

        if (invitationSent) {
            return res.redirect(
                `/employees/${employee._id}`
            );
        }

        return res.redirect("/employees");
    }
);

// =====================================================
// GET EMPLOYEE PROFILE
// GET /employees/:id
// GET /employees/me
// =====================================================

exports.getEmployee = asyncHandler(
    async (req, res) => {
        const sessionUser = getSessionUser(req);

        if (!sessionUser) {
            return res.redirect("/login");
        }

        const dbUser = await getDbUser(req);

        if (!dbUser) {
            return res.status(401).send(
                "Login account not found. Please log in again."
            );
        }

        const organization =
            await getOrganizationOrRespond(req, res);

        if (!organization) return;

        const organizationId = String(
            organization._id
        );

        const userOrganizationId =
            getDbUserOrganizationId(dbUser);

        if (
            userOrganizationId &&
            userOrganizationId !== organizationId
        ) {
            return res.status(403).send(
                "You are not authorized to access this organization."
            );
        }

        const requestedId = String(
            req.params.id || ""
        );

        const isMyProfile =
            requestedId === "me" ||
            req.path.replace(/\/+$/, "").endsWith("/me");

        let employee = null;

        if (isMyProfile) {
            const userEmployeeField =
                getEmployeeReferenceField(User);

            const linkedEmployeeId = userEmployeeField
                ? normalizeId(dbUser[userEmployeeField])
                : "";

            if (isValidObjectId(linkedEmployeeId)) {
                employee = await Employee.findOne({
                    _id: linkedEmployeeId,
                    organization: organization._id
                });
            }

            // Employee schema supplied earlier does not have a
            // user reference. Email matching is the fallback.
            if (!employee && dbUser.email) {
                employee = await Employee.findOne({
                    organization: organization._id,
                    email: normalizeEmail(dbUser.email)
                }).collation({
                    locale: "en",
                    strength: 2
                });
            }

            if (!employee) {
                return res.status(404).send(
                    "Employee profile not found. Please contact HR."
                );
            }

        } else {
            if (!isValidObjectId(requestedId)) {
                return res.status(400).send(
                    "Invalid employee ID."
                );
            }

            const hrUser = isHrUser(sessionUser);

            if (!hrUser) {
                const userEmployeeField =
                    getEmployeeReferenceField(User);

                const linkedEmployeeId = userEmployeeField
                    ? normalizeId(dbUser[userEmployeeField])
                    : "";

                const emailMatches = normalizeEmail(
                    dbUser.email
                );

                const ownEmployee = await Employee.findOne({
                    organization: organization._id,
                    $or: [
                        ...(isValidObjectId(linkedEmployeeId)
                            ? [{ _id: linkedEmployeeId }]
                            : []),
                        ...(emailMatches
                            ? [{ email: emailMatches }]
                            : [])
                    ]
                }).select("_id").lean();

                if (
                    !ownEmployee ||
                    String(ownEmployee._id) !== requestedId
                ) {
                    return res.status(403).send(
                        "You are not authorized to view this employee profile."
                    );
                }
            }

            employee = await Employee.findOne({
                _id: requestedId,
                organization: organization._id
            });
        }

        if (!employee) {
            return res.status(404).send(
                "Employee not found."
            );
        }

        await employee.populate([
            { path: "department", select: "name code" },
            { path: "designation", select: "name code level" },
            { path: "branch", select: "name code city state" },
            { path: "location", select: "name city" }
        ]);

        return res.render("employees/profile", {
            title: "Employee Profile",
            user: sessionUser,
            organization,
            employee
        });
    }
);

// =====================================================
// GET EDIT EMPLOYEE
// GET /employees/:id/edit
// =====================================================

exports.getEditEmployee = asyncHandler(
    async (req, res) => {
        const organization =
            await getOrganizationOrRespond(req, res);

        if (!organization) return;

        const id = String(req.params.id || "");

        if (!isValidObjectId(id)) {
            return res.status(400).send(
                "Invalid employee ID."
            );
        }

        const employee = await Employee.findOne({
            _id: id,
            organization: organization._id
        });

        if (!employee) {
            return res.status(404).send(
                "Employee not found."
            );
        }

        const [
            departments,
            designations,
            branches,
            locations
        ] = await Promise.all([
            getActiveReferenceOptions(
                Department,
                organization._id
            ),
            getActiveReferenceOptions(
                Designation,
                organization._id
            ),
            getActiveReferenceOptions(
                Branch,
                organization._id
            ),
            getActiveReferenceOptions(
                Location,
                organization._id
            )
        ]);

        return res.render("employees/edit", {
            title: "Edit Employee",
            user: getSessionUser(req) || {},
            organization,
            employee,
            departments,
            designations,
            branches,
            locations,
            error: null
        });
    }
);

// =====================================================
// UPDATE EMPLOYEE
// PUT/PATCH /employees/:id
// =====================================================

exports.updateEmployee = asyncHandler(
    async (req, res) => {
        const organization =
            await getOrganizationOrRespond(req, res);

        if (!organization) return;

        const id = String(req.params.id || "");

        if (!isValidObjectId(id)) {
            return res.status(400).send(
                "Invalid employee ID."
            );
        }

        const employee = await Employee.findOne({
            _id: id,
            organization: organization._id
        });

        if (!employee) {
            return res.status(404).send(
                "Employee not found."
            );
        }

        const body = req.body || {};

        const employeeId = normalizeEmployeeId(
            body.employeeId
        );

        const firstName = String(
            body.firstName || ""
        ).trim();

        const lastName = String(
            body.lastName || ""
        ).trim();

        const email = normalizeEmail(body.email);

        if (!employeeId || !firstName || !email) {
            return res.status(400).send(
                "Employee ID, First Name and Email are required."
            );
        }

        if (!EMAIL_PATTERN.test(email)) {
            return res.status(400).send(
                "Please enter a valid email address."
            );
        }

        if (
            body.gender &&
            !["Male", "Female", "Other"].includes(body.gender)
        ) {
            return res.status(400).send(
                "Invalid gender."
            );
        }

        const employmentType =
            body.employmentType || "Permanent";

        if (!EMPLOYMENT_TYPES.includes(employmentType)) {
            return res.status(400).send(
                "Invalid employment type."
            );
        }

        const status = body.status || employee.status;

        if (!EMPLOYEE_STATUSES.includes(status)) {
            return res.status(400).send(
                "Invalid employee status."
            );
        }

        const duplicate = await Employee.findOne({
            organization: organization._id,
            _id: { $ne: employee._id },
            $or: [
                { employeeId },
                { email }
            ]
        }).lean();

        if (duplicate) {
            return res.status(409).send(
                duplicate.employeeId === employeeId
                    ? "Another employee already uses this Employee ID."
                    : "Another employee already uses this email."
            );
        }

        let references;

        try {
            references = await validateEmployeeReferences(
                body,
                organization
            );
        } catch (error) {
            return res.status(400).send(error.message);
        }

        let dateOfBirth;
        let joiningDate;

        try {
            dateOfBirth = parseOptionalDate(
                body.dateOfBirth,
                "date of birth"
            );

            joiningDate = parseOptionalDate(
                body.joiningDate,
                "joining date"
            );
        } catch (error) {
            return res.status(400).send(error.message);
        }

        if (
            dateOfBirth &&
            dateOfBirth.getTime() > Date.now()
        ) {
            return res.status(400).send(
                "Date of birth cannot be in the future."
            );
        }

        // If the employee email changes, check any linked User
        // account before updating either document.
        const userEmployeeField =
            getEmployeeReferenceField(User);

        const userOrganizationField =
            getOrganizationField(User);

        let linkedUser = null;

        if (userEmployeeField) {
            const userFilter = {
                [userEmployeeField]: employee._id
            };

            if (userOrganizationField) {
                userFilter[userOrganizationField] =
                    organization._id;
            }

            linkedUser = await User.findOne(userFilter);
        }

        const emailOwner = await User.findOne({
            email,
            ...(linkedUser
                ? { _id: { $ne: linkedUser._id } }
                : {})
        }).select("_id").lean();

        if (emailOwner) {
            return res.status(409).send(
                "This email belongs to another login account."
            );
        }

        // Store original values for compensation if the linked
        // account update fails. Transactions are preferable when
        // the MongoDB deployment supports them.
        const original = employee.toObject();

        employee.employeeId = employeeId;
        employee.firstName = firstName;
        employee.lastName = lastName;
        employee.email = email;
        employee.phone = String(body.phone || "").trim();
        employee.gender = body.gender || "";
        employee.dateOfBirth = dateOfBirth;
        employee.department = references.department;
        employee.designation = references.designation;
        employee.branch = references.branch;
        employee.location = references.location;
        employee.joiningDate = joiningDate;
        employee.employmentType = employmentType;
        employee.reportingManager = String(
            body.reportingManager || ""
        ).trim();
        employee.address = String(body.address || "").trim();
        employee.status = status;

        // Organization is always taken from the authenticated
        // user's organization, never from the submitted form.
        employee.organization = organization._id;

        await employee.save();

        try {
            if (linkedUser) {
                if (hasPath(User, "email")) {
                    linkedUser.email = email;
                }

                if (hasPath(User, "name")) {
                    linkedUser.name = [
                        firstName,
                        lastName
                    ].filter(Boolean).join(" ");
                }

                await linkedUser.save();
            }
        } catch (accountError) {
            console.error(
                "Linked user update failed:",
                accountError
            );

            // Restore the original employee data.
            await Employee.updateOne(
                {
                    _id: employee._id,
                    organization: organization._id
                },
                {
                    $set: {
                        employeeId: original.employeeId,
                        firstName: original.firstName,
                        lastName: original.lastName,
                        email: original.email,
                        phone: original.phone,
                        gender: original.gender,
                        dateOfBirth: original.dateOfBirth,
                        department: original.department,
                        designation: original.designation,
                        branch: original.branch,
                        location: original.location,
                        joiningDate: original.joiningDate,
                        employmentType: original.employmentType,
                        reportingManager: original.reportingManager,
                        address: original.address,
                        status: original.status
                    }
                }
            );

            return res.status(500).send(
                "Employee update could not be completed because the linked account update failed."
            );
        }

        try {
            await createEmployeeLeaveBalances(
                employee,
                organization
            );
        } catch (balanceError) {
            console.error(
                "Leave balance setup warning:",
                balanceError
            );
        }

        return res.redirect(
            `/employees/${employee._id}`
        );
    }
);

// =====================================================
// EXIT EMPLOYEE — SOFT DELETE
// DELETE /employees/:id
// =====================================================

exports.deleteEmployee = asyncHandler(
    async (req, res) => {
        const organization =
            await getOrganizationOrRespond(req, res);

        if (!organization) return;

        const id = String(req.params.id || "");

        if (!isValidObjectId(id)) {
            return res.status(400).send(
                "Invalid employee ID."
            );
        }

        const employee = await Employee.findOne({
            _id: id,
            organization: organization._id
        });

        if (!employee) {
            return res.status(404).send(
                "Employee not found."
            );
        }

        if (employee.status === "Exited") {
            return res.redirect("/employees");
        }

        employee.status = "Exited";

        await employee.save();

        const userEmployeeField =
            getEmployeeReferenceField(User);

        const userOrganizationField =
            getOrganizationField(User);

        if (userEmployeeField) {
            const userFilter = {
                [userEmployeeField]: employee._id
            };

            if (userOrganizationField) {
                userFilter[userOrganizationField] =
                    organization._id;
            }

            const update = {};

            if (hasPath(User, "status")) {
                const allowedValues =
                    User.schema.path("status").enumValues || [];

                update.status =
                    allowedValues.includes("INACTIVE")
                        ? "INACTIVE"
                        : allowedValues.includes("Inactive")
                            ? "Inactive"
                            : "INACTIVE";
            }

            for (const field of [
                "invitationTokenHash",
                "setPasswordTokenHash",
                "passwordSetupTokenHash",
                "resetPasswordTokenHash",
                "invitationExpiresAt",
                "setPasswordExpiresAt",
                "passwordSetupExpiresAt",
                "resetPasswordExpiresAt"
            ]) {
                if (hasPath(User, field)) {
                    update[field] = null;
                }
            }

            if (Object.keys(update).length > 0) {
                await User.updateOne(
                    userFilter,
                    { $set: update }
                );
            }
        }

        console.log(
            `Employee exited: ${employee.employeeId}`
        );

        return res.redirect("/employees");
    }
);
