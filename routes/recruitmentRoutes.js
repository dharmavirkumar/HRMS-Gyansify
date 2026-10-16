
const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/authMiddleware");

// =====================================================
// OPTIONAL MODEL
// =====================================================
// Agar JobOpening model already bana hua hai to uncomment
// const JobOpening = require("../models/JobOpening");


// =====================================================
// HELPER
// =====================================================

const getUser = (req) => {
    return req.session?.user || null;
};


// =====================================================
// RECRUITMENT DASHBOARD
// GET /recruitment
// =====================================================

router.get("/", requireAuth, async (req, res) => {

    try {

        const user = getUser(req);

        return res.render("recruitment/index", {

            title: "Recruitment",

            user,

            stats: {

                openPositions: 0,

                applications: 0,

                interviews: 0,

                hired: 0,

                screening: 0,

                offers: 0

            },

            jobOpenings: [],

            recentApplications: []

        });

    } catch (error) {

        console.error(
            "Recruitment Dashboard Error:",
            error
        );

        return res.status(500).render(
            "500",
            {
                title: "Internal Server Error",
                user: getUser(req),
                error
            }
        );

    }

});


// =====================================================
// CREATE JOB
// GET /recruitment/create
// =====================================================

router.get("/create", requireAuth, async (req, res) => {

    try {

        return res.render(
            "recruitment/create",
            {

                title: "Create Job Opening",

                user: getUser(req),

                error: null,

                success: null,

                formData: {

                    title: "",

                    department: "",

                    location: "",

                    employmentType: "FULL_TIME",

                    openings: 1,

                    experienceMin: "",

                    experienceMax: "",

                    salaryMin: "",

                    salaryMax: "",

                    description: "",

                    responsibilities: "",

                    requirements: "",

                    skills: "",

                    status: "DRAFT",

                    closingDate: ""

                }

            }
        );

    } catch (error) {

        console.error(
            "Recruitment Create Page Error:",
            error
        );

        return res.status(500).render(
            "500",
            {
                title: "Internal Server Error",
                user: getUser(req),
                error
            }
        );

    }

});


// =====================================================
// CREATE JOB
// POST /recruitment/create
// =====================================================

router.post("/create", requireAuth, async (req, res) => {

    try {

        console.log("====================================");
        console.log("RECRUITMENT CREATE REQUEST");
        console.log("====================================");

        console.log(req.body);


        // -------------------------------------------------
        // GET FORM DATA
        // -------------------------------------------------

        const {

            title,
            department,
            location,
            employmentType,
            openings,
            experienceMin,
            experienceMax,
            salaryMin,
            salaryMax,
            description,
            responsibilities,
            requirements,
            skills,
            status,
            closingDate

        } = req.body;


        // -------------------------------------------------
        // CLEAN DATA
        // -------------------------------------------------

        const cleanTitle =
            title ? title.trim() : "";

        const cleanDepartment =
            department ? department.trim() : "";

        const cleanLocation =
            location ? location.trim() : "";

        const cleanDescription =
            description ? description.trim() : "";

        const cleanResponsibilities =
            responsibilities
                ? responsibilities.trim()
                : "";

        const cleanRequirements =
            requirements
                ? requirements.trim()
                : "";

        const cleanSkills =
            skills
                ? skills.trim()
                : "";


        // -------------------------------------------------
        // VALIDATION
        // -------------------------------------------------

        if (!cleanTitle) {

            return res.status(400).render(
                "recruitment/create",
                {

                    title: "Create Job Opening",

                    user: getUser(req),

                    error: "Job title is required.",

                    success: null,

                    formData: req.body

                }
            );

        }


        if (!cleanDepartment) {

            return res.status(400).render(
                "recruitment/create",
                {

                    title: "Create Job Opening",

                    user: getUser(req),

                    error: "Department is required.",

                    success: null,

                    formData: req.body

                }
            );

        }


        // -------------------------------------------------
        // NUMBER CONVERSION
        // -------------------------------------------------

        const totalOpenings =
            Number(openings) || 1;

        const minExperience =
            experienceMin !== ""
                ? Number(experienceMin)
                : null;

        const maxExperience =
            experienceMax !== ""
                ? Number(experienceMax)
                : null;

        const minSalary =
            salaryMin !== ""
                ? Number(salaryMin)
                : null;

        const maxSalary =
            salaryMax !== ""
                ? Number(salaryMax)
                : null;


        // -------------------------------------------------
        // NUMBER VALIDATION
        // -------------------------------------------------

        if (totalOpenings < 1) {

            return res.status(400).render(
                "recruitment/create",
                {

                    title: "Create Job Opening",

                    user: getUser(req),

                    error:
                        "Number of openings must be at least 1.",

                    success: null,

                    formData: req.body

                }
            );

        }


        if (
            minExperience !== null &&
            maxExperience !== null &&
            minExperience > maxExperience
        ) {

            return res.status(400).render(
                "recruitment/create",
                {

                    title: "Create Job Opening",

                    user: getUser(req),

                    error:
                        "Minimum experience cannot be greater than maximum experience.",

                    success: null,

                    formData: req.body

                }
            );

        }


        if (
            minSalary !== null &&
            maxSalary !== null &&
            minSalary > maxSalary
        ) {

            return res.status(400).render(
                "recruitment/create",
                {

                    title: "Create Job Opening",

                    user: getUser(req),

                    error:
                        "Minimum salary cannot be greater than maximum salary.",

                    success: null,

                    formData: req.body

                }
            );

        }


        // -------------------------------------------------
        // STATUS
        // -------------------------------------------------

        const jobStatus =
            status || "DRAFT";


        // -------------------------------------------------
        // EMPLOYMENT TYPE
        // -------------------------------------------------

        const jobEmploymentType =
            employmentType || "FULL_TIME";


        // -------------------------------------------------
        // CLOSING DATE
        // -------------------------------------------------

        let parsedClosingDate = null;

        if (closingDate) {

            parsedClosingDate =
                new Date(closingDate);

            if (
                Number.isNaN(
                    parsedClosingDate.getTime()
                )
            ) {

                return res.status(400).render(
                    "recruitment/create",
                    {

                        title: "Create Job Opening",

                        user: getUser(req),

                        error:
                            "Please enter a valid closing date.",

                        success: null,

                        formData: req.body

                    }
                );

            }

        }


        // -------------------------------------------------
        // ORGANIZATION
        // -------------------------------------------------

        const organizationId =
            req.session?.user?.organizationId ||
            req.session?.user?.organization ||
            null;


        // -------------------------------------------------
        // PREPARE JOB
        // -------------------------------------------------

        const jobData = {

            organizationId,

            title: cleanTitle,

            department: cleanDepartment,

            location: cleanLocation,

            employmentType:
                jobEmploymentType,

            openings:
                totalOpenings,

            experienceMin:
                minExperience,

            experienceMax:
                maxExperience,

            salaryMin:
                minSalary,

            salaryMax:
                maxSalary,

            description:
                cleanDescription,

            responsibilities:
                cleanResponsibilities,

            requirements:
                cleanRequirements,

            skills:
                cleanSkills,

            status:
                jobStatus,

            closingDate:
                parsedClosingDate,

            createdBy:
                req.session?.user?._id ||
                req.session?.user?.id ||
                null

        };


        // =================================================
        // DATABASE SAVE
        // =================================================
        //
        // Jab JobOpening model ready ho:
        //
        // const job = await JobOpening.create(jobData);
        //
        // Filhaal database save disabled hai.
        // =================================================

        console.log("JOB DATA READY:");
        console.log(jobData);


        // -------------------------------------------------
        // SUCCESS
        // -------------------------------------------------

        return res.redirect(
            "/recruitment"
        );

    } catch (error) {

        console.error(
            "===================================="
        );

        console.error(
            "RECRUITMENT CREATE ERROR"
        );

        console.error(
            "===================================="
        );

        console.error(error);


        return res.status(500).render(
            "recruitment/create",
            {

                title: "Create Job Opening",

                user: getUser(req),

                error:
                    "Unable to create job opening. Please try again.",

                success: null,

                formData: req.body

            }
        );

    }

});


// =====================================================
// CANDIDATES
// GET /recruitment/candidates
// =====================================================

router.get(
    "/candidates",
    requireAuth,
    async (req, res) => {

        try {

            return res.render(
                "recruitment/candidates",
                {

                    title: "Candidates",

                    user: getUser(req),

                    candidates: []

                }
            );

        } catch (error) {

            console.error(
                "Recruitment Candidates Error:",
                error
            );

            return res.status(500).send(
                "Gyansify HRMS - Internal Server Error"
            );

        }

    }
);


// =====================================================
// INTERVIEWS
// GET /recruitment/interviews
// =====================================================

router.get(
    "/interviews",
    requireAuth,
    async (req, res) => {

        try {

            return res.render(
                "recruitment/interviews",
                {

                    title: "Interviews",

                    user: getUser(req),

                    interviews: []

                }
            );

        } catch (error) {

            console.error(
                "Recruitment Interviews Error:",
                error
            );

            return res.status(500).send(
                "Gyansify HRMS - Internal Server Error"
            );

        }

    }
);



// =====================================================
// OFFERS
// GET /recruitment/offers
// =====================================================

router.get("/offers", requireAuth, async (req, res) => {
    try {
        return res.render("recruitment/offers", {
            title: "Offers",
            user: getUser(req),
            offers: []
        });
    } catch (error) {
        console.error("Recruitment Offers Error:", error);
        return res.status(500).send(
            "Gyansify HRMS - Internal Server Error"
        );
    }
});


// =====================================================
// CREATE OFFER FORM
// GET /recruitment/offers/create
// =====================================================

router.get(
    "/offers/create",
    requireAuth,
    (req, res) => {
        return res.render("recruitment/offers/create", {
            title: "Create Offer",
            user: getUser(req),
            error: null,
            formData: {
                candidateName: "",
                candidateEmail: "",
                jobTitle: "",
                department: "",
                employmentType: "FULL_TIME",
                offeredSalary: "",
                joiningDate: "",
                offerExpiryDate: "",
                notes: ""
            }
        });
    }
);


// =====================================================
// SUBMIT OFFER FORM
// POST /recruitment/offers/create
// =====================================================

router.post(
    "/offers/create",
    requireAuth,
    async (req, res) => {
        try {
            const {
                candidateName,
                candidateEmail,
                jobTitle,
                department,
                employmentType,
                offeredSalary,
                joiningDate,
                offerExpiryDate,
                notes
            } = req.body || {};

            const formData = {
                candidateName: String(candidateName || "").trim(),
                candidateEmail: String(candidateEmail || "")
                    .trim()
                    .toLowerCase(),
                jobTitle: String(jobTitle || "").trim(),
                department: String(department || "").trim(),
                employmentType: String(
                    employmentType || "FULL_TIME"
                ),
                offeredSalary: String(offeredSalary || "").trim(),
                joiningDate: String(joiningDate || "").trim(),
                offerExpiryDate: String(
                    offerExpiryDate || ""
                ).trim(),
                notes: String(notes || "").trim()
            };

            const fail = (message) => res.status(400).render(
                "recruitment/offers/create",
                {
                    title: "Create Offer",
                    user: getUser(req),
                    error: message,
                    formData
                }
            );

            if (
                !formData.candidateName ||
                !formData.candidateEmail ||
                !formData.jobTitle ||
                !formData.department ||
                !formData.joiningDate ||
                !formData.offeredSalary
            ) {
                return fail(
                    "Please complete all required fields."
                );
            }

            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailPattern.test(formData.candidateEmail)) {
                return fail("Please enter a valid candidate email.");
            }

            const salary = Number(formData.offeredSalary);

            if (!Number.isFinite(salary) || salary < 0) {
                return fail(
                    "Offered salary must be a valid non-negative number."
                );
            }

            const parseDate = (value) => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                    return null;
                }

                const date = new Date(`${value}T00:00:00.000Z`);

                return !Number.isNaN(date.getTime()) &&
                    date.toISOString().slice(0, 10) === value
                    ? date
                    : null;
            };

            const joiningDateValue = parseDate(
                formData.joiningDate
            );

            const expiryDateValue = formData.offerExpiryDate
                ? parseDate(formData.offerExpiryDate)
                : null;

            if (!joiningDateValue) {
                return fail("Please enter a valid joining date.");
            }

            if (
                formData.offerExpiryDate &&
                !expiryDateValue
            ) {
                return fail("Please enter a valid offer expiry date.");
            }

            if (
                expiryDateValue &&
                expiryDateValue < new Date(
                    `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`
                )
            ) {
                return fail("Offer expiry date cannot be in the past.");
            }

            if (
                ![
                    "FULL_TIME",
                    "PART_TIME",
                    "CONTRACT",
                    "INTERN"
                ].includes(formData.employmentType)
            ) {
                return fail("Please select a valid employment type.");
            }

            // IMPORTANT:
            // No Offer model is connected yet. Do not report
            // this form as saved until persistent storage exists.
            return res.status(501).render(
                "recruitment/offers/create",
                {
                    title: "Create Offer",
                    user: getUser(req),
                    error:
                        "The form is validated, but offer database saving is not configured yet. Connect an Offer model to save records.",
                    formData
                }
            );
        } catch (error) {
            console.error("Create Offer Error:", error);

            return res.status(500).send(
                "Unable to process the offer form."
            );
        }
    }
);


// =====================================================
// EXPORT
// =====================================================

module.exports = router;
