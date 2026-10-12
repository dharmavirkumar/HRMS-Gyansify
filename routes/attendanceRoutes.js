
"use strict";

const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/authMiddleware");
const attendanceController = require("../controllers/attendanceController");

router.use(requireAuth);

router.get("/my", attendanceController.getMyAttendance);
router.get("/", attendanceController.getTodayAttendance);
router.get("/history", attendanceController.getAttendanceHistory);

router.post("/check-in/:employeeId", attendanceController.checkIn);
router.post("/check-out/:employeeId", attendanceController.checkOut);

module.exports = router;
