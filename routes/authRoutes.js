
const express = require("express");

const router = express.Router();

const authController = require("../controllers/authController");
const invitationController = require("../controllers/invitationController");


 // =====================================================
 // EMPLOYEE INVITATION — SET PASSWORD
 // =====================================================

// EMPLOYEE INVITATION — SET PASSWORD

router.get(
    "/set-password",
    invitationController.getSetPassword
);

router.post(
    "/set-password",
    invitationController.postSetPassword
);

// Invitation link: /accept-invitation?token=...&email=...
router.get(
    "/accept-invitation",
    invitationController.getSetPassword
);

router.post(
    "/accept-invitation",
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
