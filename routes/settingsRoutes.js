
const express = require("express");

const router = express.Router();

const { requireAuth } =
    require("../middleware/authMiddleware");


// =====================================================
// SETTINGS
// GET /settings
// =====================================================

router.get(
    "/",
    requireAuth,
    async (req, res) => {

        try {

            const user =
                req.session?.user || null;


            return res.render(
                "settings/index",
                {

                    title: "Settings",

                    user,

                    success: null,

                    error: null

                }
            );

        } catch (error) {

            console.error(
                "Settings Page Error:",
                error
            );

            return res.status(500).send(
                "Gyansify HRMS - Internal Server Error"
            );

        }

    }
);


module.exports = router;
