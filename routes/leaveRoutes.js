
"use strict";

const express = require("express");
const router = express.Router();

const leaveController = require("../controllers/leaveController");
const {
    requireAuth,
    requireRole
} = require("../middleware/authMiddleware");

// All leave routes require login.
router.use(requireAuth);

// HR-only access for reviewing requests.
const hrAccess = requireRole(
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE"
);

// Employee leave dashboard.
router.get("/", leaveController.getLeaveDashboard);

// Apply for leave.
router.get("/apply", leaveController.getApplyLeave);
router.post("/apply", leaveController.applyLeave);

// Employee leave history and cancellation.
router.get("/my", leaveController.getMyLeaves);
router.post("/my/:id/cancel", leaveController.cancelLeave);

// HR leave management.
router.get(
    "/requests",
    hrAccess,
    leaveController.getAllLeaveRequests
);

router.post(
    "/requests/:id/approve",
    hrAccess,
    leaveController.approveLeave
);

router.post(
    "/requests/:id/reject",
    hrAccess,
    leaveController.rejectLeave
);

module.exports = router;
