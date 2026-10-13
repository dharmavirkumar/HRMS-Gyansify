
"use strict";

const mongoose = require("mongoose");

const Onboarding = require("../models/Onboarding");
const Department = require("../models/Department");
const Designation = require("../models/Designation");
const Employee = require("../models/Employee");
const EmployeeDocument = require("../models/EmployeeDocument");
const cloudinary = require("../config/cloudinary");


const ACTIVE_ONBOARDING_STATUSES = [
    "DRAFT",
    "IN_PROGRESS",
    "PENDING_APPROVAL",
    "APPROVED"
];

const ALLOWED_EMPLOYMENT_TYPES = [
    "Permanent",
    "Probation",
    "Contract",
    "Intern",
    "Part Time"
];

const DEFAULT_TASKS = [
    {
        title: "Verify employee information",
        description: "Verify the employee's personal and joining details.",
        category: "HR"
    },
    {
        title: "Collect required documents",
        description: "Collect and verify required employee documents.",
        category: "DOCUMENTS"
    },
    {
        title: "Prepare IT access and equipment",
        description: "Arrange required accounts, equipment and system access.",
        category: "IT"
    },
    {
        title: "Complete induction",
        description: "Complete the employee orientation and induction.",
        category: "TRAINING"
    }
];

// =====================================================
// HELPERS
// =====================================================

function getUser(req) {
    return req.session?.user || {};
}

function getId(value) {
    if (!value) return null;

    if (typeof value === "object") {
        return value._id || value.id || null;
    }

    return value;
}

function getOrganizationId(req) {
    const user = getUser(req);

    return getId(
        user.organizationId ||
        user.organization ||
        user.organizationID
    );
}

function getUserId(req) {
    const user = getUser(req);

    return getId(user._id || user.id || user.userId);
}

function hasValidId(value) {
    return Boolean(
        value && mongoose.isValidObjectId(String(value))
    );
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function parseDateOnly(value) {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return null;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
    ) {
        return null;
    }

    return date;
}

function getErrorMessage(error) {
    if (error?.name === "ValidationError") {
        return "Some onboarding information is invalid. Please review your entries.";
    }

    if (error?.name === "CastError") {
        return "One of the supplied values is invalid.";
    }

    return "Something went wrong. Please try again.";
}

function getFormData(req) {
    const body = req.body || {};

    return {
        firstName: String(body.firstName || ""),
        lastName: String(body.lastName || ""),
        email: String(body.email || ""),
        phone: String(body.phone || ""),
        joiningDate: String(body.joiningDate || ""),
        employmentType: String(
            body.employmentType || "Permanent"
        ),
        reportingManager: String(body.reportingManager || ""),
        notes: String(body.notes || ""),
        department: String(
            body.department || body.departmentId || ""
        ),
        designation: String(
            body.designation || body.designationId || ""
        )
    };
}

function getOnboardingFilter(req) {
    return {
        organization: getOrganizationId(req)
    };
}

function getStatusStats(organizationId) {
    const filter = { organization: organizationId };

    return Promise.all([
        Onboarding.countDocuments(filter),

        Onboarding.countDocuments({
            ...filter,
            status: { $in: ACTIVE_ONBOARDING_STATUSES }
        }),

        Onboarding.countDocuments({
            ...filter,
            status: "COMPLETED"
        }),

        Onboarding.countDocuments({
            ...filter,
            status: "REJECTED"
        }),

        Onboarding.countDocuments({
            ...filter,
            status: "CANCELLED"
        })
    ]);
}

// Department and Designation are queried according to the
// schemas currently used in this project, which use global
// Active records. Add organization scoping if those schemas
// become organization-specific.
async function getFormOptions() {
    const [departments, designations] = await Promise.all([
        Department.find({ status: "Active" })
            .sort({ name: 1 })
            .select("_id name code")
            .lean(),

        Designation.find({ status: "Active" })
            .sort({ name: 1 })
            .select("_id name code level")
            .lean()
    ]);

    return { departments, designations };
}

async function renderCreateError(
    res,
    req,
    message,
    statusCode = 400
) {
    try {
        const { departments, designations } =
            await getFormOptions();

        return res.status(statusCode).render(
            "onboarding/create",
            {
                title: "Create Employee Onboarding",
                user: getUser(req),
                error: message,
                formData: getFormData(req),
                departments,
                designations
            }
        );
    } catch (error) {
        console.error("Onboarding Form Error:", error);

        return res.status(500).send(
            "Unable to load the onboarding form. Please try again."
        );
    }
}

// =====================================================
// GET /onboarding
// ONBOARDING DASHBOARD
// =====================================================

exports.getDashboard = async (req, res, next) => {
    try {
        const organizationId = getOrganizationId(req);

        if (!hasValidId(organizationId)) {
            return res.status(403).send(
                "Your account has no valid organization. Please sign in again."
            );
        }

        const filter = {
            organization: organizationId
        };

        const [
            onboardings,
            stats
        ] = await Promise.all([
            Onboarding.find(filter)
                .sort({ createdAt: -1, _id: -1 })
                .limit(100)
                .populate(
                    "employee",
                    "employeeId firstName lastName"
                )
                .populate("department", "name code")
                .populate("designation", "name code level")
                .lean(),

            getStatusStats(organizationId)
        ]);

        const [
            total,
            pending,
            completed,
            rejected,
            cancelled
        ] = stats;

        return res.render("onboarding/index", {
            title: "Employee Onboarding",
            user: getUser(req),
            onboardings,
            stats: {
                total,
                pending,
                completed,
                rejected,
                cancelled
            }
        });
    } catch (error) {
        console.error("Onboarding Dashboard Error:", error);
        return next(error);
    }
};

// =====================================================
// GET /onboarding/create
// DISPLAY CREATE FORM
// =====================================================

exports.getCreate = async (req, res, next) => {
    try {
        const organizationId = getOrganizationId(req);

        if (!hasValidId(organizationId)) {
            return res.status(403).send(
                "Your account has no valid organization. Please sign in again."
            );
        }

        const { departments, designations } =
            await getFormOptions();

        return res.render("onboarding/create", {
            title: "Create Employee Onboarding",
            user: getUser(req),
            error: null,
            formData: {},
            departments,
            designations
        });
    } catch (error) {
        console.error("Onboarding Form Error:", error);
        return next(error);
    }
};

// =====================================================
// POST /onboarding/create
// CREATE ONBOARDING RECORD
// =====================================================

exports.create = async (req, res, next) => {
    try {
        const organizationId = getOrganizationId(req);
        const userId = getUserId(req);

        if (!hasValidId(organizationId)) {
            return res.status(403).send(
                "Your account has no valid organization. Please sign in again."
            );
        }

        if (!hasValidId(userId)) {
            return res.status(403).send(
                "Your user account could not be verified. Please sign in again."
            );
        }

        const firstName = String(
            req.body?.firstName || ""
        ).trim();

        const lastName = String(
            req.body?.lastName || ""
        ).trim();

        const email = normalizeEmail(req.body?.email);

        const phone = String(
            req.body?.phone || ""
        ).trim();

        const joiningDateInput = String(
            req.body?.joiningDate || ""
        ).trim();

        const employmentType = String(
            req.body?.employmentType || "Permanent"
        ).trim();

        const reportingManager = String(
            req.body?.reportingManager || ""
        ).trim();

        const notes = String(
            req.body?.notes || ""
        ).trim();

        const departmentId = String(
            req.body?.department ||
            req.body?.departmentId ||
            ""
        ).trim();

        const designationId = String(
            req.body?.designation ||
            req.body?.designationId ||
            ""
        ).trim();

        // Required fields
        if (!firstName || !email || !joiningDateInput) {
            return renderCreateError(
                res,
                req,
                "First name, email and joining date are required."
            );
        }

        // Name validation
        if (
            firstName.length > 80 ||
            lastName.length > 80
        ) {
            return renderCreateError(
                res,
                req,
                "First name and last name must not exceed 80 characters."
            );
        }

        // Email validation
        if (
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            return renderCreateError(
                res,
                req,
                "Please enter a valid email address."
            );
        }

        // Phone validation
        if (phone.length > 20) {
            return renderCreateError(
                res,
                req,
                "Phone number must not exceed 20 characters."
            );
        }

        // Employment type validation
        if (!ALLOWED_EMPLOYMENT_TYPES.includes(employmentType)) {
            return renderCreateError(
                res,
                req,
                "Please select a valid employment type."
            );
        }

        // Text length validation
        if (
            reportingManager.length > 150 ||
            notes.length > 2000
        ) {
            return renderCreateError(
                res,
                req,
                "Reporting manager or notes exceed the allowed length."
            );
        }

        // Date validation
        const joiningDate = parseDateOnly(joiningDateInput);

        if (!joiningDate) {
            return renderCreateError(
                res,
                req,
                "Please enter a valid joining date."
            );
        }

        // Validate IDs before querying MongoDB
        if (
            departmentId &&
            !hasValidId(departmentId)
        ) {
            return renderCreateError(
                res,
                req,
                "Invalid department selected."
            );
        }

        if (
            designationId &&
            !hasValidId(designationId)
        ) {
            return renderCreateError(
                res,
                req,
                "Invalid designation selected."
            );
        }

        // Validate active dropdown selections
        const [department, designation] = await Promise.all([
            departmentId
                ? Department.findOne({
                    _id: departmentId,
                    status: "Active"
                }).select("_id")
                : Promise.resolve(null),

            designationId
                ? Designation.findOne({
                    _id: designationId,
                    status: "Active"
                }).select("_id")
                : Promise.resolve(null)
        ]);

        if (departmentId && !department) {
            return renderCreateError(
                res,
                req,
                "The selected department was not found or is inactive."
            );
        }

        if (designationId && !designation) {
            return renderCreateError(
                res,
                req,
                "The selected designation was not found or is inactive."
            );
        }

        // Prevent duplicate active onboarding
        const existingOnboarding = await Onboarding.findOne({
            organization: organizationId,
            email,
            status: {
                $in: ACTIVE_ONBOARDING_STATUSES
            }
        }).select("_id");

        if (existingOnboarding) {
            return renderCreateError(
                res,
                req,
                "An active onboarding record already exists for this email.",
                409
            );
        }

        // Prevent duplicate employee
        // The case-insensitive match also catches emails stored
        // with different letter casing.
        const existingEmployee = await Employee.findOne({
            organization: organizationId,
            email: {
                $regex: `^${email.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                )}$`,
                $options: "i"
            }
        }).select("_id employeeId");

        if (existingEmployee) {
            return renderCreateError(
                res,
                req,
                "An employee with this email already exists in your organization.",
                409
            );
        }

        // Create onboarding record
        const onboarding = await Onboarding.create({
            organization: organizationId,
            firstName,
            lastName,
            email,
            phone,
            joiningDate,
            employmentType,

            department: department?._id || null,
            designation: designation?._id || null,

            reportingManager,
            notes,

            status: "DRAFT",
            createdBy: userId,

            tasks: DEFAULT_TASKS.map((task) => ({
                ...task
            })),

            documents: []
        });

        return res.redirect(
            `/onboarding/${onboarding._id}`
        );
    } catch (error) {
        if (error?.code === 11000) {
            return renderCreateError(
                res,
                req,
                "A conflicting record already exists. Please check the email and try again.",
                409
            );
        }

        console.error("Create Onboarding Error:", error);

        if (
            error?.name === "ValidationError" ||
            error?.name === "CastError"
        ) {
            return renderCreateError(
                res,
                req,
                getErrorMessage(error)
            );
        }

        return next(error);
    }
};

// =====================================================
// GET /onboarding/:id
// ONBOARDING DETAILS + CLOUDINARY DOCUMENT RECORDS
// =====================================================

exports.getDetails = async (req, res, next) => {
    try {
        const organizationId = getOrganizationId(req);
        const onboardingId = req.params.id;

        if (!hasValidId(organizationId)) {
            return res.status(403).send(
                "Your account has no valid organization. Please sign in again."
            );
        }

        if (!hasValidId(onboardingId)) {
            return res.status(400).send(
                "Invalid onboarding ID."
            );
        }

        const [onboarding, employeeDocuments] =
            await Promise.all([
                Onboarding.findOne({
                    _id: onboardingId,
                    organization: organizationId
                })
                    .populate(
                        "employee",
                        "employeeId firstName lastName"
                    )
                    .populate("department", "name code")
                    .populate("designation", "name code level")
                    .populate("tasks.assignedTo", "name email")
                    .populate("documents.reviewedBy", "name email")
                    .lean(),

                EmployeeDocument.find({
                    organization: organizationId,
                    onboarding: onboardingId
                })
                    .sort({ createdAt: -1, _id: -1 })
                    .populate("uploadedBy", "name email")
                    .populate("reviewedBy", "name email")
                    .lean()
            ]);

        if (!onboarding) {
            return res.status(404).send(
                "Onboarding record not found."
            );
        }

        
return res.render("onboarding/show", {
    title: "Onboarding Details",
    user: getUser(req),
    onboarding,
    employeeDocuments,
    success: String(req.query.success || ""),
    error: String(req.query.error || "")
});

    } catch (error) {
        console.error("Onboarding Details Error:", error);
        return next(error);
    }
};


/* =====================================================
   ONBOARDING APPROVAL WORKFLOW HELPERS
===================================================== */

function redirectOnboardingMessage(res, onboardingId, type, message) {
    const params = new URLSearchParams({
        [type]: message
    });

    return res.redirect(
        `/onboarding/${onboardingId}?${params.toString()}`
    );
}

async function getOnboardingForAction(req) {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const onboardingId = req.params.id;

    if (!hasValidId(organizationId)) {
        const error = new Error(
            "Your account has no valid organization. Please sign in again."
        );
        error.status = 403;
        throw error;
    }

    if (!hasValidId(userId)) {
        const error = new Error(
            "Your user account could not be verified. Please sign in again."
        );
        error.status = 403;
        throw error;
    }

    if (!hasValidId(onboardingId)) {
        const error = new Error("Invalid onboarding ID.");
        error.status = 400;
        throw error;
    }

    const onboarding = await Onboarding.findOne({
        _id: onboardingId,
        organization: organizationId
    });

    if (!onboarding) {
        const error = new Error("Onboarding record not found.");
        error.status = 404;
        throw error;
    }

    return {
        onboarding,
        organizationId,
        userId
    };
}

/*
 * Checks the tasks and documents before final approval.
 * Documents are read from the separate EmployeeDocument
 * collection as well as the embedded onboarding.documents.
 */
async function validateOnboardingForApproval(
    onboarding,
    organizationId
) {
    const tasks = Array.isArray(onboarding.tasks)
        ? onboarding.tasks
        : [];

    if (tasks.length === 0) {
        return "Add onboarding tasks before requesting approval.";
    }

    const incompleteTasks = tasks.filter(
        task => task.status !== "COMPLETED"
    );

    if (incompleteTasks.length > 0) {
        return "Complete all onboarding tasks before requesting approval.";
    }

    const employeeDocuments = await EmployeeDocument.find({
        organization: organizationId,
        onboarding: onboarding._id
    })
        .select("status")
        .lean();

    const embeddedDocuments = Array.isArray(onboarding.documents)
        ? onboarding.documents
        : [];

    const allDocuments = [
        ...employeeDocuments,
        ...embeddedDocuments
    ];

    if (allDocuments.length === 0) {
        return "Upload and approve the required employee documents before proceeding.";
    }

    const unapprovedDocuments = allDocuments.filter(
        document => document.status !== "APPROVED"
    );

    if (unapprovedDocuments.length > 0) {
        return "All submitted employee documents must be approved first.";
    }

    return null;
}

/* =====================================================
   POST /onboarding/:id/start
   DRAFT -> IN_PROGRESS
===================================================== */

exports.startOnboarding = async (req, res, next) => {
    let onboardingId = req.params.id;

    try {
        const {
            onboarding,
            userId
        } = await getOnboardingForAction(req);

        if (onboarding.status !== "DRAFT") {
            return redirectOnboardingMessage(
                res,
                onboarding._id,
                "error",
                "Only draft onboarding records can be started."
            );
        }

        onboarding.status = "IN_PROGRESS";
        onboarding.updatedBy = userId;

        await onboarding.save();

        return redirectOnboardingMessage(
            res,
            onboarding._id,
            "success",
            "Onboarding started successfully."
        );
    } catch (error) {
        if (error.status) {
            return res.status(error.status).send(error.message);
        }

        console.error("Start Onboarding Error:", error);
        return next(error);
    }
};

/* =====================================================
   POST /onboarding/:id/submit-for-approval
   IN_PROGRESS -> PENDING_APPROVAL
===================================================== */

exports.submitForApproval = async (req, res, next) => {
    try {
        const {
            onboarding,
            organizationId,
            userId
        } = await getOnboardingForAction(req);

        if (onboarding.status !== "IN_PROGRESS") {
            return redirectOnboardingMessage(
                res,
                onboarding._id,
                "error",
                "Only in-progress onboarding records can be submitted for approval."
            );
        }

        const validationMessage =
            await validateOnboardingForApproval(
                onboarding,
                organizationId
            );

        if (validationMessage) {
            return redirectOnboardingMessage(
                res,
                onboarding._id,
                "error",
                validationMessage
            );
        }

        onboarding.status = "PENDING_APPROVAL";
        onboarding.updatedBy = userId;

        await onboarding.save();

        return redirectOnboardingMessage(
            res,
            onboarding._id,
            "success",
            "Onboarding submitted for approval successfully."
        );
    } catch (error) {
        if (error.status) {
            return res.status(error.status).send(error.message);
        }

        console.error("Submit Onboarding Error:", error);
        return next(error);
    }
};

/* =====================================================
   POST /onboarding/:id/approve
   PENDING_APPROVAL -> APPROVED
===================================================== */

exports.approveOnboarding = async (req, res, next) => {
    try {
        const {
            onboarding,
            organizationId,
            userId
        } = await getOnboardingForAction(req);

        if (onboarding.status !== "PENDING_APPROVAL") {
            return redirectOnboardingMessage(
                res,
                onboarding._id,
                "error",
                "Only onboarding records pending approval can be approved."
            );
        }

        const validationMessage =
            await validateOnboardingForApproval(
                onboarding,
                organizationId
            );

        if (validationMessage) {
            return redirectOnboardingMessage(
                res,
                onboarding._id,
                "error",
                validationMessage
            );
        }

        onboarding.status = "APPROVED";
        onboarding.approvedBy = userId;
        onboarding.approvedAt = new Date();
        onboarding.updatedBy = userId;

        onboarding.rejectedBy = undefined;
        onboarding.rejectedAt = undefined;
        onboarding.rejectionReason = "";

        await onboarding.save();

        return redirectOnboardingMessage(
            res,
            onboarding._id,
            "success",
            "Onboarding approved successfully."
        );
    } catch (error) {
        if (error.status) {
            return res.status(error.status).send(error.message);
        }

        console.error("Approve Onboarding Error:", error);
        return next(error);
    }
};

/* =====================================================
   POST /onboarding/:id/reject
   PENDING_APPROVAL -> REJECTED
===================================================== */

exports.rejectOnboarding = async (req, res, next) => {
    try {
        const {
            onboarding,
            userId
        } = await getOnboardingForAction(req);

        if (onboarding.status !== "PENDING_APPROVAL") {
            return redirectOnboardingMessage(
                res,
                onboarding._id,
                "error",
                "Only onboarding records pending approval can be rejected."
            );
        }

        const rejectionReason = String(
            req.body?.rejectionReason || ""
        ).trim();

        if (!rejectionReason) {
            return redirectOnboardingMessage(
                res,
                onboarding._id,
                "error",
                "Please provide a reason for rejecting this onboarding."
            );
        }

        if (rejectionReason.length > 1000) {
            return redirectOnboardingMessage(
                res,
                onboarding._id,
                "error",
                "The rejection reason must not exceed 1000 characters."
            );
        }

        onboarding.status = "REJECTED";
        onboarding.rejectedBy = userId;
        onboarding.rejectedAt = new Date();
        onboarding.rejectionReason = rejectionReason;
        onboarding.updatedBy = userId;

        onboarding.approvedBy = undefined;
        onboarding.approvedAt = undefined;

        await onboarding.save();

        return redirectOnboardingMessage(
            res,
            onboarding._id,
            "success",
            "Onboarding rejected successfully."
        );
    } catch (error) {
        if (error.status) {
            return res.status(error.status).send(error.message);
        }

        console.error("Reject Onboarding Error:", error);
        return next(error);
    }
};


// =====================================================
// ONBOARDING TASK WORKFLOW
// =====================================================

exports.startTask = async (req, res, next) => {
    try {
        const { onboarding, userId } =
            await getOnboardingForAction(req);

        const taskId = req.params.taskId;

        if (onboarding.status !== "IN_PROGRESS") {
            return redirectOnboardingMessage(
                res,
                onboarding._id,
                "error",
                "Start the onboarding before starting its tasks."
            );
        }

        const task = onboarding.tasks.id(taskId);

        if (!task) {
            return redirectOnboardingMessage(
                res,
                onboarding._id,
                "error",
                "Onboarding task not found."
            );
        }

        if (task.status !== "PENDING") {
            return redirectOnboardingMessage(
                res,
                onboarding._id,
                "error",
                "Only pending tasks can be started."
            );
        }

        task.status = "IN_PROGRESS";
        task.startedAt = new Date();
        task.completedAt = null;
        task.updatedBy = userId;

        onboarding.updatedBy = userId;

        await onboarding.save();

        return redirectOnboardingMessage(
            res,
            onboarding._id,
            "success",
            "Task started successfully."
        );
    } catch (error) {
        if (error.status) {
            return res.status(error.status).send(error.message);
        }

        console.error("Start Onboarding Task Error:", error);
        return next(error);
    }
};

exports.completeTask = async (req, res, next) => {
    try {
        const { onboarding, userId } =
            await getOnboardingForAction(req);

        const taskId = req.params.taskId;
        const remarks = String(
            req.body?.remarks || ""
        ).trim();

        if (onboarding.status !== "IN_PROGRESS") {
            return redirectOnboardingMessage(
                res,
                onboarding._id,
                "error",
                "Only in-progress onboarding tasks can be completed."
            );
        }

        const task = onboarding.tasks.id(taskId);

        if (!task) {
            return redirectOnboardingMessage(
                res,
                onboarding._id,
                "error",
                "Onboarding task not found."
            );
        }

        if (task.status !== "IN_PROGRESS") {
            return redirectOnboardingMessage(
                res,
                onboarding._id,
                "error",
                "Start this task before marking it complete."
            );
        }

        if (remarks.length > 1000) {
            return redirectOnboardingMessage(
                res,
                onboarding._id,
                "error",
                "Task remarks must not exceed 1000 characters."
            );
        }

        task.status = "COMPLETED";
        task.completedAt = new Date();
        task.remarks = remarks;
        task.updatedBy = userId;

        onboarding.updatedBy = userId;

        await onboarding.save();

        return redirectOnboardingMessage(
            res,
            onboarding._id,
            "success",
            "Task marked as completed successfully."
        );
    } catch (error) {
        if (error.status) {
            return res.status(error.status).send(error.message);
        }

        console.error("Complete Onboarding Task Error:", error);
        return next(error);
    }
};



exports.downloadDocument = async (req, res) => {
    try {
        const organizationId = getOrganizationId(req);
        const { documentId } = req.params;

        if (
            !organizationId ||
            !mongoose.isValidObjectId(organizationId)
        ) {
            return res.status(400).send("Invalid organization.");
        }

        if (!mongoose.isValidObjectId(documentId)) {
            return res.status(400).send("Invalid document ID.");
        }

        // Fetch only a document belonging to this organization.
        // storageKey and storageFormat are select:false in the schema.
        const document = await EmployeeDocument.findOne({
            _id: documentId,
            organization: organizationId,
            storageProvider: "cloudinary"
        }).select("+storageKey +storageFormat");

        if (!document) {
            return res.status(404).send("Document not found.");
        }

        // This endpoint is specifically for onboarding documents.
        if (!document.onboarding) {
            return res.status(404).send("Onboarding document not found.");
        }

        // Verify that the linked onboarding record belongs to this tenant.
        const onboarding = await Onboarding.findOne({
            _id: document.onboarding,
            organization: organizationId
        }).select("_id");

        if (!onboarding) {
            return res.status(404).send("Onboarding record not found.");
        }

        const allowedMimeTypes = [
            "application/pdf",
            "image/jpeg",
            "image/png"
        ];

        if (!allowedMimeTypes.includes(document.mimeType)) {
            return res.status(415).send("Unsupported document type.");
        }

        // Prevent header injection and unsafe filenames.
        const safeFilename = String(document.originalName || "document")
            .replace(/[\r\n"]/g, "_")
            .replace(/[\\/]/g, "_")
            .slice(0, 255);

        /*
         * Cloudinary resource_type must match the upload configuration.
         * This implementation checks image storage first, then raw storage.
         */
        let resourceType = "image";

        try {
            await cloudinary.api.resource(document.storageKey, {
                resource_type: "image",
                type: "upload"
            });
        } catch (imageError) {
            try {
                await cloudinary.api.resource(document.storageKey, {
                    resource_type: "raw",
                    type: "upload"
                });

                resourceType = "raw";
            } catch (rawError) {
                console.error(
                    "Cloudinary document lookup failed:",
                    rawError.message
                );

                return res.status(404).send(
                    "The stored document could not be found."
                );
            }
        }

        // Generate a time-limited attachment URL.
        const expiresAt = Math.floor(Date.now() / 1000) + 120;

        const downloadUrl = cloudinary.utils.private_download_url(
            document.storageKey,
            document.storageFormat,
            {
                resource_type: resourceType,
                type: "upload",
                expires_at: expiresAt,
                attachment: safeFilename
            }
        );

        return res.redirect(downloadUrl);
    } catch (error) {
        console.error("Document download error:", error);

        return res.status(500).send(
            "Unable to download the document right now."
        );
    }
};
