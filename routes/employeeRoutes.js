"use strict";

const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const employeeController = require("../controllers/employeeController");

const {
    requireAuth,
    requireRole
} = require("../middleware/authMiddleware");

// =====================================================
// GYANSIFY HRMS
// EMPLOYEE ROUTES
// =====================================================

// All employee routes require an authenticated user.
router.use(requireAuth);

// =====================================================
// ROLE-BASED ACCESS CONTROL
// =====================================================

const hrAccess = requireRole(
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE"
);

// =====================================================
// EMPLOYEE ID VALIDATION
// =====================================================

const validateEmployeeId = (req, res, next) => {
    const id = req.params.id;

    if (
        typeof id !== "string" ||
        !/^[a-fA-F0-9]{24}$/.test(id) ||
        !mongoose.isValidObjectId(id)
    ) {
        return res.status(400).send(
            "Invalid employee ID."
        );
    }

    return next();
};

// =====================================================
// CONTROLLER VALIDATION
// Fail clearly if a required controller method is missing.
// =====================================================

const requiredHandlers = [
    "getEmployees",
    "getEmployee",
    "getCreateEmployee",
    "createEmployee",
    "getEditEmployee",
    "updateEmployee",
    "deleteEmployee"
];

for (const handler of requiredHandlers) {
    if (typeof employeeController[handler] !== "function") {
        throw new TypeError(
            `Employee controller method "${handler}" is missing or is not a function.`
        );
    }
}

// =====================================================
// EMPLOYEE DIRECTORY
// GET /employees
// HR ROLES ONLY
// =====================================================

router.get(
    "/",
    hrAccess,
    employeeController.getEmployees
);

// =====================================================
// CREATE EMPLOYEE
// GET  /employees/create
// POST /employees/create
// HR ROLES ONLY
// =====================================================

router.get(
    "/create",
    hrAccess,
    employeeController.getCreateEmployee
);

router.post(
    "/create",
    hrAccess,
    employeeController.createEmployee
);

// =====================================================
// CURRENT EMPLOYEE PROFILE
// GET /employees/me
// Authenticated employee; controller checks account linkage.
// =====================================================

router.get(
    "/me",
    employeeController.getEmployee
);

// =====================================================
// EDIT EMPLOYEE
// GET  /employees/:id/edit
// POST /employees/:id/edit
// HR ROLES ONLY
// =====================================================

router.get(
    "/:id/edit",
    hrAccess,
    validateEmployeeId,
    employeeController.getEditEmployee
);

router.post(
    "/:id/edit",
    hrAccess,
    validateEmployeeId,
    employeeController.updateEmployee
);

// =====================================================
// SOFT DELETE / EMPLOYEE EXIT
// POST /employees/:id/delete
// HR ROLES ONLY
// =====================================================

router.post(
    "/:id/delete",
    hrAccess,
    validateEmployeeId,
    employeeController.deleteEmployee
);

// =====================================================
// VIEW EMPLOYEE PROFILE
// GET /employees/:id
// Controller must enforce profile ownership and HR access.
// =====================================================

router.get(
    "/:id",
    validateEmployeeId,
    employeeController.getEmployee
);

// =====================================================
// EXPORT ROUTER
// =====================================================

module.exports = router;