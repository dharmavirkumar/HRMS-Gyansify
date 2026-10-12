
"use strict";

const express = require("express");
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

// Roles allowed to manage payroll operations.
const payrollAdmin = requireRole(
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE"
);

// Roles allowed to access the payslips section.
const payrollUsers = requireRole(
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE",
    "EMPLOYEE"
);

// =====================================================
// PAYROLL DASHBOARD
// GET /payroll
// Admin / HR only
// =====================================================

router.get(
    "/",
    payrollAdmin,
    payrollController.getPayrollDashboard
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
    payrollController.getSalaryStructures
);

router.post(
    "/salary-structures",
    payrollAdmin,
    payrollController.createSalaryStructure
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
    (req, res, next) => {
        if (
            typeof payrollController.processPayroll !== "function"
        ) {
            const error = new Error(
                "processPayroll is not exported by payrollController."
            );

            error.status = 500;
            return next(error);
        }

        return payrollController.processPayroll(req, res, next);
    }
);

// =====================================================
// EMPLOYEE PAYSLIPS
// GET /payroll/payslips
// Logged-in employees and authorized HR roles
// =====================================================

router.get(
    "/payslips",
    payrollUsers,
    payrollController.getPayslips
);


router.get(
    "/payslips/:id",
    payrollUsers,
    payrollController.getPayslipDetails
);

// =====================================================
// PAYROLL HISTORY
// GET /payroll/history
// Admin / HR only
// =====================================================

router.get(
    "/history",
    payrollAdmin,
    payrollController.getPayrollHistory
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
