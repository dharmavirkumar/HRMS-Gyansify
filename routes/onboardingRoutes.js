
"use strict";

const express = require("express");
const mongoose = require("mongoose");


const router = express.Router();

const {
    requireAuth,
    requireRole
} = require("../middleware/authMiddleware");

const onboardingController = require("../controllers/onboardingController");

// =====================================================
// AUTHENTICATION
// All onboarding routes require login.
// =====================================================

router.use(requireAuth);

// =====================================================
// HR ACCESS CONTROL
// =====================================================

const hrAccess = requireRole(
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE"
);

// =====================================================
// ID VALIDATION MIDDLEWARE
// =====================================================

const validateOnboardingId = (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).send("Invalid onboarding ID.");
    }

    next();
};

const validateTaskIds = (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).send("Invalid onboarding ID.");
    }

    if (!mongoose.isValidObjectId(req.params.taskId)) {
        return res.status(400).send("Invalid onboarding task ID.");
    }

    next();
};

// =====================================================
// ONBOARDING DASHBOARD
// GET /onboarding
// =====================================================

router.get(
    "/",
    hrAccess,
    onboardingController.getDashboard
);

// =====================================================
// CREATE ONBOARDING
// GET  /onboarding/create
// POST /onboarding/create
// =====================================================

router.get(
    "/create",
    hrAccess,
    onboardingController.getCreate
);

router.post(
    "/create",
    hrAccess,
    onboardingController.create
);

// =====================================================
// START ONBOARDING
// POST /onboarding/:id/start
// DRAFT -> IN_PROGRESS
// =====================================================

router.post(
    "/:id/start",
    hrAccess,
    validateOnboardingId,
    onboardingController.startOnboarding
);

// =====================================================
// ONBOARDING TASK WORKFLOW
// =====================================================

// Start a pending task.
// POST /onboarding/:id/tasks/:taskId/start

router.post(
    "/:id/tasks/:taskId/start",
    hrAccess,
    validateTaskIds,
    onboardingController.startTask
);

// Mark an in-progress task as completed.
// POST /onboarding/:id/tasks/:taskId/complete

router.post(
    "/:id/tasks/:taskId/complete",
    hrAccess,
    validateTaskIds,
    onboardingController.completeTask
);

// =====================================================
// SUBMIT ONBOARDING FOR APPROVAL
// POST /onboarding/:id/submit-for-approval
// IN_PROGRESS -> PENDING_APPROVAL
// =====================================================

router.post(
    "/:id/submit-for-approval",
    hrAccess,
    validateOnboardingId,
    onboardingController.submitForApproval
);

// =====================================================
// APPROVE ONBOARDING
// POST /onboarding/:id/approve
// PENDING_APPROVAL -> APPROVED
// =====================================================

router.post(
    "/:id/approve",
    hrAccess,
    validateOnboardingId,
    onboardingController.approveOnboarding
);

// =====================================================
// REJECT ONBOARDING
// POST /onboarding/:id/reject
// PENDING_APPROVAL -> REJECTED
// =====================================================

router.post(
    "/:id/reject",
    hrAccess,
    validateOnboardingId,
    onboardingController.rejectOnboarding
);



/**
 * DOWNLOAD ONBOARDING DOCUMENT
 * GET /onboarding/documents/:documentId/download
 */
router.get(
    "/documents/:documentId/download",
    hrAccess,
    (req, res, next) => {
        if (!mongoose.isValidObjectId(req.params.documentId)) {
            return res.status(400).send("Invalid document ID.");
        }

        next();
    },
    onboardingController.downloadDocument
);


// =====================================================
// VIEW ONBOARDING DETAILS
// GET /onboarding/:id
// Keep this route AFTER the specific routes above.
// =====================================================

router.get(
    "/:id",
    hrAccess,
    validateOnboardingId,
    onboardingController.getDetails
);

// =====================================================
// EXPORT ROUTER
// =====================================================

module.exports = router;
