
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
// AUTHENTICATION
// Every employee route requires authentication.
// =====================================================

router.use(requireAuth);

// =====================================================
// ROLE ACCESS
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
        !mongoose.isValidObjectId(id) ||
        !/^[a-fA-F0-9]{24}$/.test(id)
    ) {
        return res.status(400).send("Invalid employee ID.");
    }

    return next();
};

// =====================================================
// EMPLOYEE DIRECTORY
// GET /employees
// HR ONLY
// =====================================================

router.get(
    "/",
    hrAccess,
    employeeController.getEmployees
);

// =====================================================
// CURRENT EMPLOYEE PROFILE
// GET /employees/me
// Controller verifies the linked employee account.
// =====================================================

router.get(
    "/me",
    employeeController.getEmployee
);

// =====================================================
// CREATE EMPLOYEE
// GET  /employees/create
// POST /employees/create
// HR ONLY
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
// EDIT EMPLOYEE
// GET  /employees/:id/edit
// POST /employees/:id/edit
// HR ONLY
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
// EXIT EMPLOYEE — SOFT DELETE
// POST /employees/:id/delete
// HR ONLY
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
// Controller checks HR/profile ownership permissions.
// =====================================================

router.get(
    "/:id",
    validateEmployeeId,
    employeeController.getEmployee
);

module.exports = router;
