
"use strict";

const express = require("express");
const router = express.Router();

const officeLocationController = require("../controllers/officeLocationController");

// Use your existing middleware files.
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Support either direct function exports or named middleware exports.
const requireAuth =
    typeof authMiddleware === "function"
        ? authMiddleware
        : authMiddleware.requireAuth || authMiddleware.authenticate;

const requireRole =
    typeof roleMiddleware === "function"
        ? roleMiddleware
        : roleMiddleware.requireRole;

if (typeof requireAuth !== "function") {
    throw new TypeError(
        "authMiddleware must export a middleware function. Check middleware/authMiddleware.js"
    );
}

if (typeof requireRole !== "function") {
    throw new TypeError(
        "roleMiddleware must export a role middleware function. Check middleware/roleMiddleware.js"
    );
}

router.use(requireAuth);
router.use(requireRole("SUPER_ADMIN", "HR_ADMIN", "HR_EXECUTIVE"));

router.get(
    "/office-location",
    officeLocationController.getSettings
);

router.post(
    "/office-location",
    officeLocationController.saveSettings
);

module.exports = router;
