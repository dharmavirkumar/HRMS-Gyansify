
const express = require("express");

const router = express.Router();

const organizationController =
    require("../controllers/organizationController");

const {
    requireAuth,
    requireRole
} = require("../middleware/authMiddleware");

// =====================================================
// AUTHENTICATION
// =====================================================

router.use(requireAuth);

// =====================================================
// ORGANIZATION ADMIN ACCESS
// =====================================================

router.use(
    requireRole(
        "SUPER_ADMIN",
        "HR_ADMIN"
    )
);

// =====================================================
// ORGANIZATION SETUP PAGE
// =====================================================

router.get(
    "/",
    organizationController.getOrganizationSetup
);

// =====================================================
// CREATE DEPARTMENT
// =====================================================

router.post(
    "/departments",
    organizationController.createDepartment
);

// =====================================================
// CREATE DESIGNATION
// =====================================================

router.post(
    "/designations",
    organizationController.createDesignation
);

// =====================================================
// CREATE BRANCH
// =====================================================

router.post(
    "/branches",
    organizationController.createBranch
);

// =====================================================
// CREATE LOCATION
// =====================================================

router.post(
    "/locations",
    organizationController.createLocation
);

// =====================================================
// EXPORT
// =====================================================

module.exports = router;