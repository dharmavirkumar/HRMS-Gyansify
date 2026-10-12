
const express = require("express");

const router = express.Router();

const {
    requireAuth,
    requireRole
} = require("../middleware/authMiddleware");

const performanceController =
    require("../controllers/performanceController");

// =====================================================
// AUTHENTICATION
// =====================================================

router.use(requireAuth);

// =====================================================
// ROLE GROUPS
// =====================================================

const reviewManagementAccess = requireRole(
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE",
    "MANAGER"
);

const reviewViewAccess = requireRole(
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE",
    "MANAGER",
    "EMPLOYEE"
);

// =====================================================
// PERFORMANCE DASHBOARD
// GET /performance
// =====================================================

router.get(
    "/",
    reviewViewAccess,
    performanceController.getPerformanceDashboard
);

// =====================================================
// CREATE PERFORMANCE REVIEW PAGE
// GET /performance/create
// =====================================================

router.get(
    "/create",
    reviewManagementAccess,
    performanceController.getCreatePerformanceReview
);

// =====================================================
// CREATE PERFORMANCE REVIEW
// POST /performance/create
// =====================================================

router.post(
    "/create",
    reviewManagementAccess,
    performanceController.createPerformanceReview
);

// =====================================================
// EDIT PERFORMANCE REVIEW PAGE
// GET /performance/:id/edit
// Keep this route before /:id.
// =====================================================

router.get(
    "/:id/edit",
    reviewManagementAccess,
    performanceController.getEditPerformanceReview
);

// =====================================================
// UPDATE PERFORMANCE REVIEW
// POST /performance/:id/edit
// =====================================================

router.post(
    "/:id/edit",
    reviewManagementAccess,
    performanceController.updatePerformanceReview
);

// =====================================================
// CANCEL PERFORMANCE REVIEW
// POST /performance/:id/cancel
// =====================================================

router.post(
    "/:id/cancel",
    reviewManagementAccess,
    performanceController.cancelPerformanceReview
);

// =====================================================
// VIEW PERFORMANCE REVIEW
// GET /performance/:id
// Controller must verify record ownership/access.
// =====================================================

router.get(
    "/:id",
    reviewViewAccess,
    performanceController.getPerformanceReview
);

// =====================================================
// EXPORT
// =====================================================

module.exports = router;