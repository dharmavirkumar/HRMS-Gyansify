
"use strict";

const mongoose = require("mongoose");

const Department = require("../models/Department");
const Designation = require("../models/Designation");
const Branch = require("../models/Branch");
const Location = require("../models/Location");
const User = require("../models/User");

// =====================================================
// HELPERS
// =====================================================

const clean = (value) =>
    typeof value === "string" ? value.trim() : "";

const getSessionUser = (req) =>
    req.session?.user || req.user || {};

const getUserId = (user) =>
    user?._id || user?.id || user?.userId || null;

const getOrganizationFromUser = (user) =>
    user?.organizationId?._id ||
    user?.organizationId ||
    user?.organizationID?._id ||
    user?.organizationID ||
    user?.organization?._id ||
    user?.organization ||
    null;

// Fetch organization from the database first, then fall back
// to organization information stored in the authenticated session.
const getCurrentOrganizationId = async (req) => {
    const sessionUser = getSessionUser(req);
    const userId = getUserId(sessionUser);

    if (userId && mongoose.isValidObjectId(String(userId))) {
        const dbUser = await User.findById(userId)
            .select("_id organization role status")
            .lean();

        if (dbUser) {
            if (
                dbUser.status &&
                dbUser.status !== "ACTIVE"
            ) {
                return null;
            }

            const dbOrganizationId =
                getOrganizationFromUser(dbUser);

            if (
                dbOrganizationId &&
                mongoose.isValidObjectId(String(dbOrganizationId))
            ) {
                return new mongoose.Types.ObjectId(
                    String(dbOrganizationId)
                );
            }

            // A valid database user without an organization should
            // not silently inherit another organization from session.
            return null;
        }
    }

    const sessionOrganizationId =
        getOrganizationFromUser(sessionUser);

    if (
        sessionOrganizationId &&
        mongoose.isValidObjectId(String(sessionOrganizationId))
    ) {
        return new mongoose.Types.ObjectId(
            String(sessionOrganizationId)
        );
    }

    return null;
};

const sendValidationError = (res, message, status = 400) =>
    res.status(status).send(message);

const handleControllerError = (res, error, label) => {
    console.error(`${label}:`, error);

    if (error.code === 11000) {
        return res.status(409).send(
            "A record with this name or code already exists."
        );
    }

    if (error.name === "ValidationError") {
        return res.status(400).send(error.message);
    }

    return res.status(500).send(
        `Unable to complete the request for ${label.toLowerCase()}.`
    );
};

// =====================================================
// ORGANIZATION SETUP PAGE
// GET /organization
// =====================================================

exports.getOrganizationSetup = async (req, res) => {
    try {
        const organizationId = await getCurrentOrganizationId(req);

        if (!organizationId) {
            return sendValidationError(
                res,
                "Your account is not linked to a valid organization. Please log in again or contact the administrator.",
                400
            );
        }

        const [
            departments,
            designations,
            branches,
            locations
        ] = await Promise.all([
            Department.find({ organizationId })
                .sort({ name: 1 })
                .lean(),

            Designation.find({ organizationId })
                .sort({ name: 1 })
                .lean(),

            // Branch and Location schemas currently have no
            // organizationId field, so these remain global lists.
            Branch.find()
                .sort({ name: 1 })
                .lean(),

            Location.find()
                .sort({ name: 1 })
                .lean()
        ]);

        const user = getSessionUser(req);

        return res.render("organization/index", {
            title: "Organization Setup",
            user: {
                ...user,
                name: user.name || "Administrator",
                role: user.role || "SUPER_ADMIN"
            },
            departments,
            designations,
            branches,
            locations
        });
    } catch (error) {
        console.error("Organization Setup Error:", error);

        return res.status(500).send(
            "Unable to load organization setup."
        );
    }
};

// =====================================================
// ADD DEPARTMENT
// POST /organization/departments/create
// =====================================================

exports.createDepartment = async (req, res) => {
    try {
        const organizationId = await getCurrentOrganizationId(req);

        if (!organizationId) {
            return sendValidationError(
                res,
                "Cannot create department: organization not found in your account.",
                400
            );
        }

        const name = clean(req.body.name);
        const code = clean(req.body.code).toUpperCase();
        const description = clean(req.body.description);

        if (!name || !code) {
            return sendValidationError(
                res,
                "Department name and code are required."
            );
        }

        await Department.create({
            organizationId,
            name,
            code,
            description,
            status: "Active"
        });

        return res.redirect("/organization");
    } catch (error) {
        return handleControllerError(
            res,
            error,
            "Create Department"
        );
    }
};

// =====================================================
// ADD DESIGNATION
// POST /organization/designations/create
// =====================================================

exports.createDesignation = async (req, res) => {
    try {
        const organizationId = await getCurrentOrganizationId(req);

        if (!organizationId) {
            return sendValidationError(
                res,
                "Cannot create designation: organization not found in your account.",
                400
            );
        }

        const name = clean(req.body.name);
        const code = clean(req.body.code).toUpperCase();
        const level = clean(req.body.level) || "Mid Level";

        const allowedLevels = [
            "Intern",
            "Junior",
            "Mid Level",
            "Senior",
            "Lead",
            "Manager",
            "Director"
        ];

        if (!name || !code) {
            return sendValidationError(
                res,
                "Designation name and code are required."
            );
        }

        if (!allowedLevels.includes(level)) {
            return sendValidationError(
                res,
                "Please select a valid designation level."
            );
        }

        await Designation.create({
            organizationId,
            name,
            code,
            level,
            status: "Active"
        });

        return res.redirect("/organization");
    } catch (error) {
        return handleControllerError(
            res,
            error,
            "Create Designation"
        );
    }
};

// =====================================================
// ADD BRANCH
// POST /organization/branches/create
// =====================================================

exports.createBranch = async (req, res) => {
    try {
        const name = clean(req.body.name);
        const code = clean(req.body.code).toUpperCase();
        const city = clean(req.body.city);
        const state = clean(req.body.state);

        if (!name || !code || !city) {
            return sendValidationError(
                res,
                "Branch name, code and city are required."
            );
        }

        await Branch.create({
            name,
            code,
            city,
            state,
            status: "Active"
        });

        return res.redirect("/organization");
    } catch (error) {
        return handleControllerError(
            res,
            error,
            "Create Branch"
        );
    }
};

// =====================================================
// ADD LOCATION
// POST /organization/locations/create
// =====================================================

exports.createLocation = async (req, res) => {
    try {
        const name = clean(req.body.name);
        const city = clean(req.body.city);
        const address = clean(req.body.address);

        if (!name || !city) {
            return sendValidationError(
                res,
                "Location name and city are required."
            );
        }

        await Location.create({
            name,
            city,
            address,
            status: "Active"
        });

        return res.redirect("/organization");
    } catch (error) {
        return handleControllerError(
            res,
            error,
            "Create Location"
        );
    }
};
