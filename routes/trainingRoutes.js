const express = require("express");

const router = express.Router();

const {
    requireAuth
} = require("../middleware/authMiddleware");


// =====================================================
// TRAINING DASHBOARD
// GET /training
// =====================================================

router.get(
    "/",
    requireAuth,
    (req, res) => {

        return res.render("training/index", {
            title: "Training",
            user: req.session.user
        });

    }
);


// =====================================================
// CREATE TRAINING
// GET /training/create
// =====================================================

router.get(
    "/create",
    requireAuth,
    (req, res) => {

        return res.render("training/create", {
            title: "Create Training",
            user: req.session.user,
            error: null,
            formData: {}
        });

    }
);


// =====================================================
// SAVE TRAINING
// POST /training/create
// =====================================================

router.post(
    "/create",
    requireAuth,
    (req, res) => {

        console.log("TRAINING FORM DATA:", req.body);

        return res.redirect("/training");

    }
);


module.exports = router;