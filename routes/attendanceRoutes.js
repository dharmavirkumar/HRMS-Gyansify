
"use strict";

const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/authMiddleware");
const attendanceController = require("../controllers/attendanceController");

// =====================================================
// AUTHENTICATION
// All attendance routes require login.
// =====================================================

router.use(requireAuth);

// =====================================================
// ATTENDANCE PAGES
// =====================================================

router.get("/", attendanceController.getTodayAttendance);

router.get("/my", attendanceController.getMyAttendance);

router.get("/history", attendanceController.getAttendanceHistory);

// =====================================================
// GEOFENCED ATTENDANCE ACTIONS
// Both POST requests must include latitude and longitude.
// =====================================================

router.post(
    "/check-in/:employeeId",
    attendanceController.checkIn
);

router.post(
    "/check-out/:employeeId",
    attendanceController.checkOut
);

module.exports = router;
