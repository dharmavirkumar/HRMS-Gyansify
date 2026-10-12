
const express = require("express");

const router = express.Router();

const authController = require("../controllers/authController");
const invitationController = require("../controllers/invitationController");

// =====================================================
// SET PASSWORD — EMPLOYEE INVITATION
// =====================================================

// Display password setup page
router.get(
    "/set-password",
    invitationController.getSetPassword
);

// Save password and activate employee account
router.post(
    "/set-password",
    invitationController.postSetPassword
);

// =====================================================
// LOGIN PAGE
// =====================================================

router.get(
    "/login",
    authController.getLogin
);

// =====================================================
// LOGIN
// =====================================================

router.post(
    "/login",
    authController.login
);

// =====================================================
// LOGOUT
// =====================================================

router.get(
    "/logout",
    authController.logout
);

router.post(
    "/logout",
    authController.logout
);

// =====================================================
// EXPORT ROUTER
// =====================================================

module.exports = router;
