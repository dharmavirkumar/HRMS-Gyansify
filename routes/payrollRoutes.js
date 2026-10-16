
"use strict";

const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const {
    requireAuth,
    requireRole
} = require("../middleware/authMiddleware");

const payrollController = require("../controllers/payrollController");

// =====================================================
// AUTHENTICATION
// All payroll routes require a logged-in user.
// =====================================================

router.use(requireAuth);

// =====================================================
// ROLE ACCESS
// =====================================================

const payrollAdmin = requireRole(
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE"
);

const payrollUsers = requireRole(
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE",
    "EMPLOYEE"
);

// =====================================================
// COMMON HELPERS
// =====================================================

/**
 * Validate MongoDB ObjectId route parameters.
 * Prevents malformed IDs from reaching controllers.
 */
function validateObjectId(paramName) {
    return function (req, res, next) {
        const value = req.params[paramName];

        if (
            typeof value !== "string" ||
            !mongoose.isValidObjectId(value)
        ) {
            return res.status(400).render("error", {
                title: "Invalid Request",
                message: "The requested payroll record ID is invalid.",
                user: req.session?.user || null
            });
        }

        return next();
    };
}

/**
 * Ensure controller methods exist before calling them.
 * This provides a useful error if a method was not exported.
 */
function requireControllerMethod(methodName) {
    return function (req, res, next) {
        const handler = payrollController[methodName];

        if (typeof handler !== "function") {
            const error = new Error(
                `payrollController.${methodName} is not exported or is not a function.`
            );

            error.status = 500;

            return next(error);
        }

        return handler(req, res, next);
    };
}

// =====================================================
// PAYROLL DASHBOARD
// GET /payroll
// Admin / HR only
// =====================================================

router.get(
    "/",
    payrollAdmin,
    requireControllerMethod("getPayrollDashboard")
);

// =====================================================
// SALARY STRUCTURES
// GET  /payroll/salary-structures
// POST /payroll/salary-structures
// Admin / HR only
// =====================================================

router.get(
    "/salary-structures",
    payrollAdmin,
    requireControllerMethod("getSalaryStructures")
);

router.post(
    "/salary-structures",
    payrollAdmin,
    requireControllerMethod("createSalaryStructure")
);

// =====================================================
// PROCESS PAYROLL PAGE
// GET /payroll/process
// Admin / HR only
// =====================================================

router.get(
    "/process",
    payrollAdmin,
    (req, res) => {
        return res.render("payroll/process", {
            title: "Process Payroll",
            user: req.session?.user || null
        });
    }
);

// =====================================================
// PROCESS PAYROLL SUBMISSION
// POST /payroll/process
// Admin / HR only
// =====================================================

router.post(
    "/process",
    payrollAdmin,
    requireControllerMethod("processPayroll")
);

// =====================================================
// EMPLOYEE PAYSLIPS
// GET /payroll/payslips
// HR roles and employees
// =====================================================

router.get(
    "/payslips",
    payrollUsers,
    requireControllerMethod("getPayslips")
);

// =====================================================
// PAYSLIP DETAILS
// GET /payroll/payslips/:id
// HR roles and employees
// =====================================================

router.get(
    "/payslips/:id",
    payrollUsers,
    validateObjectId("id"),
    requireControllerMethod("getPayslipDetails")
);

// =====================================================
// PAYROLL HISTORY
// GET /payroll/history
// Admin / HR only
// =====================================================

router.get(
    "/history",
    payrollAdmin,
    requireControllerMethod("getPayrollHistory")
);

// =====================================================
// PAYROLL DEDUCTIONS
// GET /payroll/deductions
// Admin / HR only
// =====================================================

router.get(
    "/deductions",
    payrollAdmin,
    (req, res) => {
        return res.render("payroll/deductions", {
            title: "Payroll Deductions",
            user: req.session?.user || null
        });
    }
);

// =====================================================
// EXPORT ROUTER
// =====================================================

module.exports = router;
