
"use strict";

const express = require("express");
const router = express.Router();

const leaveController = require("../controllers/leaveController");

// =====================================================
// LEAVE DASHBOARD
// GET /leave
// =====================================================

router.get(
    "/",
    leaveController.getLeaveDashboard
);

// =====================================================
// APPLY LEAVE
// GET  /leave/apply
// POST /leave/apply
// =====================================================

router.get(
    "/apply",
    leaveController.getApplyLeave
);

router.post(
    "/apply",
    leaveController.applyLeave
);

// =====================================================
// MY LEAVES
// GET /leave/my
// POST /leave/my/:id/cancel
// =====================================================

router.get(
    "/my",
    leaveController.getMyLeaves
);

router.post(
    "/my/:id/cancel",
    leaveController.cancelLeave
);

// =====================================================
// HR - ALL LEAVE REQUESTS
// GET /leave/requests
// =====================================================

router.get(
    "/requests",
    leaveController.getAllLeaveRequests
);

// =====================================================
// APPROVE LEAVE
// POST /leave/requests/:id/approve
// =====================================================

router.post(
    "/requests/:id/approve",
    leaveController.approveLeave
);

// =====================================================
// REJECT LEAVE
// POST /leave/requests/:id/reject
// =====================================================

router.post(
    "/requests/:id/reject",
    leaveController.rejectLeave
);

// =====================================================
// EXPORT
// =====================================================

module.exports = router;
