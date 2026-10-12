
const express = require("express");

const router = express.Router();

const leaveAdminController = require("../controllers/leaveAdminController");

const {
    requireAuth,
    requireRole
} = require("../middleware/authMiddleware");

// =====================================================
// AUTHENTICATION
// =====================================================

router.use(requireAuth);

// =====================================================
// HR / ADMIN ACCESS ONLY
// =====================================================

router.use(
    requireRole(
        "SUPER_ADMIN",
        "HR_ADMIN",
        "HR_EXECUTIVE"
    )
);

// =====================================================
// LEAVE TYPES
// =====================================================

// Show all leave types
router.get(
    "/types",
    leaveAdminController.getLeaveTypes
);

// Create a leave type
router.post(
    "/types",
    leaveAdminController.createLeaveType
);

// Update a leave type
router.post(
    "/types/update/:id",
    leaveAdminController.updateLeaveType
);

// Activate / deactivate a leave type
router.post(
    "/types/toggle/:id",
    leaveAdminController.toggleLeaveType
);

// =====================================================
// LEAVE BALANCES
// =====================================================

// Show employee leave balances
router.get(
    "/balances",
    leaveAdminController.getLeaveBalances
);

// Assign or update employee leave balance
router.post(
    "/balances",
    leaveAdminController.assignLeaveBalance
);

// =====================================================
// LEAVE REQUESTS
// =====================================================

// Show all leave requests
router.get(
    "/",
    leaveAdminController.getLeaveRequests
);

// Approve leave
router.post(
    "/approve/:id",
    leaveAdminController.approveLeave
);

// Reject leave
router.post(
    "/reject/:id",
    leaveAdminController.rejectLeave
);

// Revert an approved leave
router.post(
    "/revert/:id",
    leaveAdminController.revertApproval
);

// =====================================================
// EXPORT
// =====================================================

module.exports = router;
