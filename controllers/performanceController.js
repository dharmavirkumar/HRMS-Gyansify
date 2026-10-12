const mongoose = require("mongoose");

const Employee = require("../models/Employee");
const PerformanceReview = require("../models/PerformanceReview");


// =====================================================
// GET ORGANIZATION ID
// =====================================================

const getOrganizationId = (req) => {

    return (
        req.session?.user?.organizationId ||
        req.session?.user?.organization ||
        req.session?.user?.organizationID ||
        null
    );
};


// =====================================================
// GET PERFORMANCE DASHBOARD
// GET /performance
// =====================================================

const getPerformanceDashboard = async (req, res) => {

    try {

        const organizationId = getOrganizationId(req);

        if (!organizationId) {

            return res.status(403).render("error", {
                title: "Access Denied",
                message: "Organization information is missing."
            });
        }


        // =================================================
        // PERFORMANCE REVIEWS
        // =================================================

        const reviews = await PerformanceReview.find({
            organizationId
        })
            .populate(
                "employee",
                "firstName lastName employeeId email"
            )
            .populate(
                "reviewer",
                "name email"
            )
            .sort({
                createdAt: -1
            })
            .lean();


        // =================================================
        // STATISTICS
        // =================================================

        const totalReviews = reviews.length;

        const completedReviews = reviews.filter(
            review =>
                review.status === "COMPLETED" ||
                review.status === "ACKNOWLEDGED"
        ).length;

        const pendingReviews = reviews.filter(
            review =>
                review.status === "PENDING" ||
                review.status === "DRAFT" ||
                review.status === "SUBMITTED"
        ).length;

        const acknowledgedReviews = reviews.filter(
            review =>
                review.status === "ACKNOWLEDGED"
        ).length;


        // =================================================
        // AVERAGE RATING
        // =================================================

        let averageRating = 0;

        const ratedReviews = reviews.filter(
            review =>
                Number(review.overallRating || 0) > 0
        );

        if (ratedReviews.length > 0) {

            const totalRating = ratedReviews.reduce(
                (sum, review) =>
                    sum + Number(review.overallRating || 0),
                0
            );

            averageRating =
                totalRating / ratedReviews.length;

            averageRating =
                Number(averageRating.toFixed(2));
        }


        // =================================================
        // EMPLOYEE COUNT
        // =================================================

        const employeeCount =
            await Employee.countDocuments({
                organizationId,
                status: {
                    $ne: "Exited"
                }
            });


        // =================================================
        // RENDER
        // =================================================

        return res.render(
            "performance/index",
            {
                title: "Performance",

                user: req.session.user,

                reviews,

                totalReviews,
                completedReviews,
                pendingReviews,
                acknowledgedReviews,

                averageRating,

                employeeCount
            }
        );

    } catch (error) {

        console.error(
            "Performance Dashboard Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Performance Error",
            message: "Unable to load performance dashboard."
        });
    }
};


// =====================================================
// GET CREATE PERFORMANCE REVIEW
// GET /performance/create
// =====================================================

const getCreatePerformanceReview = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        if (!organizationId) {

            return res.status(403).render("error", {
                title: "Access Denied",
                message: "Organization information is missing."
            });
        }


        // =================================================
        // LOAD EMPLOYEES
        // =================================================

        const employees =
            await Employee.find({
                organizationId,
                status: {
                    $ne: "Exited"
                }
            })
                .select(
                    "firstName lastName employeeId email department designation"
                )
                .sort({
                    firstName: 1,
                    lastName: 1
                })
                .lean();


        return res.render(
            "performance/create",
            {
                title: "Create Performance Review",

                user: req.session.user,

                employees,

                error: null,

                formData: {}
            }
        );

    } catch (error) {

        console.error(
            "Create Performance Review Page Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Performance Error",
            message: "Unable to load performance review form."
        });
    }
};


// =====================================================
// CREATE PERFORMANCE REVIEW
// POST /performance/create
// =====================================================

const createPerformanceReview = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        if (!organizationId) {

            return res.status(403).render("error", {
                title: "Access Denied",
                message: "Organization information is missing."
            });
        }


        // =================================================
        // FORM DATA
        // =================================================

        const {
            employee,
            reviewCycle,
            reviewPeriodStart,
            reviewPeriodEnd,

            qualityOfWork,
            productivity,
            communication,
            teamwork,
            leadership,
            problemSolving,
            attendance,
            initiative,

            achievements,
            managerComments,
            developmentPlan,

            promotionRecommended,
            salaryRevisionRecommended,
            recommendedSalaryRevision
        } = req.body;


        // =================================================
        // BASIC VALIDATION
        // =================================================

        if (
            !employee ||
            !reviewCycle ||
            !reviewPeriodStart ||
            !reviewPeriodEnd
        ) {

            const employees =
                await Employee.find({
                    organizationId,
                    status: {
                        $ne: "Exited"
                    }
                })
                    .select(
                        "firstName lastName employeeId email department designation"
                    )
                    .sort({
                        firstName: 1
                    })
                    .lean();


            return res.status(400).render(
                "performance/create",
                {
                    title: "Create Performance Review",

                    user: req.session.user,

                    employees,

                    error:
                        "Please fill all required fields.",

                    formData: req.body
                }
            );
        }


        // =================================================
        // VALIDATE EMPLOYEE
        // =================================================

        const employeeRecord =
            await Employee.findOne({
                _id: employee,
                organizationId,
                status: {
                    $ne: "Exited"
                }
            }).lean();


        if (!employeeRecord) {

            const employees =
                await Employee.find({
                    organizationId,
                    status: {
                        $ne: "Exited"
                    }
                })
                    .select(
                        "firstName lastName employeeId email department designation"
                    )
                    .sort({
                        firstName: 1
                    })
                    .lean();


            return res.status(400).render(
                "performance/create",
                {
                    title: "Create Performance Review",

                    user: req.session.user,

                    employees,

                    error:
                        "Selected employee was not found.",

                    formData: req.body
                }
            );
        }


        // =================================================
        // VALIDATE DATES
        // =================================================

        const startDate =
            new Date(reviewPeriodStart);

        const endDate =
            new Date(reviewPeriodEnd);


        if (
            Number.isNaN(startDate.getTime()) ||
            Number.isNaN(endDate.getTime())
        ) {

            const employees =
                await Employee.find({
                    organizationId,
                    status: {
                        $ne: "Exited"
                    }
                })
                    .select(
                        "firstName lastName employeeId email department designation"
                    )
                    .sort({
                        firstName: 1
                    })
                    .lean();


            return res.status(400).render(
                "performance/create",
                {
                    title: "Create Performance Review",

                    user: req.session.user,

                    employees,

                    error:
                        "Please provide valid review dates.",

                    formData: req.body
                }
            );
        }


        if (endDate < startDate) {

            const employees =
                await Employee.find({
                    organizationId,
                    status: {
                        $ne: "Exited"
                    }
                })
                    .select(
                        "firstName lastName employeeId email department designation"
                    )
                    .sort({
                        firstName: 1
                    })
                    .lean();


            return res.status(400).render(
                "performance/create",
                {
                    title: "Create Performance Review",

                    user: req.session.user,

                    employees,

                    error:
                        "Review end date cannot be before the start date.",

                    formData: req.body
                }
            );
        }


        // =================================================
        // PREVENT DUPLICATE REVIEW
        // =================================================

        const existingReview =
            await PerformanceReview.findOne({
                organizationId,
                employee,
                reviewPeriodStart: startDate,
                reviewPeriodEnd: endDate,
                status: {
                    $ne: "CANCELLED"
                }
            });


        if (existingReview) {

            const employees =
                await Employee.find({
                    organizationId,
                    status: {
                        $ne: "Exited"
                    }
                })
                    .select(
                        "firstName lastName employeeId email department designation"
                    )
                    .sort({
                        firstName: 1
                    })
                    .lean();


            return res.status(400).render(
                "performance/create",
                {
                    title: "Create Performance Review",

                    user: req.session.user,

                    employees,

                    error:
                        "A performance review already exists for this employee and review period.",

                    formData: req.body
                }
            );
        }


        // =================================================
        // RATINGS
        // =================================================

        const ratings = {
            qualityOfWork:
                Number(qualityOfWork || 0),

            productivity:
                Number(productivity || 0),

            communication:
                Number(communication || 0),

            teamwork:
                Number(teamwork || 0),

            leadership:
                Number(leadership || 0),

            problemSolving:
                Number(problemSolving || 0),

            attendance:
                Number(attendance || 0),

            initiative:
                Number(initiative || 0)
        };


        // =================================================
        // VALIDATE RATINGS
        // =================================================

        for (const value of Object.values(ratings)) {

            if (
                !Number.isFinite(value) ||
                value < 0 ||
                value > 5
            ) {

                return res.status(400).send(
                    "Rating must be between 0 and 5."
                );
            }
        }


        // =================================================
        // CREATE REVIEW
        // =================================================

        const review =
            new PerformanceReview({

                organizationId,

                employee,

                reviewer:
                    req.session.user._id ||
                    req.session.user.id,

                reviewCycle,

                reviewPeriodStart: startDate,

                reviewPeriodEnd: endDate,

                status: "DRAFT",

                ratings,

                achievements:
                    achievements || "",

                managerComments:
                    managerComments || "",

                developmentPlan:
                    developmentPlan || "",

                promotionRecommended:
                    promotionRecommended === "true" ||
                    promotionRecommended === "on" ||
                    promotionRecommended === "yes",

                salaryRevisionRecommended:
                    salaryRevisionRecommended === "true" ||
                    salaryRevisionRecommended === "on" ||
                    salaryRevisionRecommended === "yes",

                recommendedSalaryRevision:
                    Number(
                        recommendedSalaryRevision || 0
                    ),

                createdBy:
                    req.session.user._id ||
                    req.session.user.id
            });


        await review.save();


        // =================================================
        // REDIRECT
        // =================================================

        return res.redirect(
            "/performance"
        );

    } catch (error) {

        console.error(
            "Create Performance Review Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Performance Error",
            message:
                "Unable to create performance review."
        });
    }
};


// =====================================================
// GET PERFORMANCE REVIEW
// GET /performance/:id
// =====================================================

const getPerformanceReview = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        if (!organizationId) {

            return res.status(403).render("error", {
                title: "Access Denied",
                message: "Organization information is missing."
            });
        }


        const { id } = req.params;


        if (!mongoose.Types.ObjectId.isValid(id)) {

            return res.status(404).render("error", {
                title: "Performance Review Not Found",
                message: "Invalid performance review ID."
            });
        }


        const review =
            await PerformanceReview.findOne({
                _id: id,
                organizationId
            })
                .populate(
                    "employee",
                    "firstName lastName employeeId email department designation joiningDate"
                )
                .populate(
                    "reviewer",
                    "name email"
                )
                .populate(
                    "createdBy",
                    "name email"
                )
                .lean();


        if (!review) {

            return res.status(404).render("error", {
                title: "Performance Review Not Found",
                message: "Performance review was not found."
            });
        }


        return res.render(
            "performance/view",
            {
                title: "Performance Review",

                user: req.session.user,

                review
            }
        );

    } catch (error) {

        console.error(
            "Get Performance Review Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Performance Error",
            message:
                "Unable to load performance review."
        });
    }
};


// =====================================================
// GET EDIT PERFORMANCE REVIEW
// GET /performance/:id/edit
// =====================================================

const getEditPerformanceReview = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        if (!organizationId) {

            return res.status(403).render("error", {
                title: "Access Denied",
                message: "Organization information is missing."
            });
        }


        const { id } = req.params;


        if (!mongoose.Types.ObjectId.isValid(id)) {

            return res.status(404).render("error", {
                title: "Performance Review Not Found",
                message: "Invalid performance review ID."
            });
        }


        const review =
            await PerformanceReview.findOne({
                _id: id,
                organizationId
            })
                .populate(
                    "employee",
                    "firstName lastName employeeId email"
                )
                .lean();


        if (!review) {

            return res.status(404).render("error", {
                title: "Performance Review Not Found",
                message: "Performance review was not found."
            });
        }


        return res.render(
            "performance/edit",
            {
                title: "Edit Performance Review",

                user: req.session.user,

                review,

                error: null
            }
        );

    } catch (error) {

        console.error(
            "Edit Performance Review Page Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Performance Error",
            message:
                "Unable to load performance review."
        });
    }
};


// =====================================================
// UPDATE PERFORMANCE REVIEW
// POST /performance/:id/edit
// =====================================================

const updatePerformanceReview = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        if (!organizationId) {

            return res.status(403).render("error", {
                title: "Access Denied",
                message: "Organization information is missing."
            });
        }


        const { id } = req.params;


        if (!mongoose.Types.ObjectId.isValid(id)) {

            return res.status(404).render("error", {
                title: "Performance Review Not Found",
                message: "Invalid performance review ID."
            });
        }


        const review =
            await PerformanceReview.findOne({
                _id: id,
                organizationId
            });


        if (!review) {

            return res.status(404).render("error", {
                title: "Performance Review Not Found",
                message: "Performance review was not found."
            });
        }


        // =================================================
        // RATINGS
        // =================================================

        const ratingFields = [
            "qualityOfWork",
            "productivity",
            "communication",
            "teamwork",
            "leadership",
            "problemSolving",
            "attendance",
            "initiative"
        ];


        ratingFields.forEach(field => {

            const value =
                Number(req.body[field] || 0);

            if (
                !Number.isFinite(value) ||
                value < 0 ||
                value > 5
            ) {
                throw new Error(
                    `${field} rating must be between 0 and 5.`
                );
            }

            review.ratings[field] = value;
        });


        // =================================================
        // UPDATE CONTENT
        // =================================================

        review.reviewCycle =
            req.body.reviewCycle ||
            review.reviewCycle;


        if (req.body.reviewPeriodStart) {

            review.reviewPeriodStart =
                new Date(
                    req.body.reviewPeriodStart
                );
        }


        if (req.body.reviewPeriodEnd) {

            review.reviewPeriodEnd =
                new Date(
                    req.body.reviewPeriodEnd
                );
        }


        if (
            review.reviewPeriodEnd <
            review.reviewPeriodStart
        ) {

            throw new Error(
                "Review end date cannot be before the start date."
            );
        }


        review.achievements =
            req.body.achievements || "";


        review.managerComments =
            req.body.managerComments || "";


        review.employeeComments =
            req.body.employeeComments || "";


        review.developmentPlan =
            req.body.developmentPlan || "";


        review.promotionRecommended =
            req.body.promotionRecommended === "true" ||
            req.body.promotionRecommended === "on" ||
            req.body.promotionRecommended === "yes";


        review.salaryRevisionRecommended =
            req.body.salaryRevisionRecommended === "true" ||
            req.body.salaryRevisionRecommended === "on" ||
            req.body.salaryRevisionRecommended === "yes";


        review.recommendedSalaryRevision =
            Number(
                req.body.recommendedSalaryRevision || 0
            );


        review.updatedBy =
            req.session.user._id ||
            req.session.user.id;


        await review.save();


        return res.redirect(
            `/performance/${review._id}`
        );

    } catch (error) {

        console.error(
            "Update Performance Review Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Performance Error",
            message:
                error.message ||
                "Unable to update performance review."
        });
    }
};


// =====================================================
// CANCEL PERFORMANCE REVIEW
// POST /performance/:id/cancel
// =====================================================

const cancelPerformanceReview = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        if (!organizationId) {

            return res.status(403).render("error", {
                title: "Access Denied",
                message: "Organization information is missing."
            });
        }


        const { id } = req.params;


        if (!mongoose.Types.ObjectId.isValid(id)) {

            return res.status(404).render("error", {
                title: "Performance Review Not Found",
                message: "Invalid performance review ID."
            });
        }


        const review =
            await PerformanceReview.findOne({
                _id: id,
                organizationId
            });


        if (!review) {

            return res.status(404).render("error", {
                title: "Performance Review Not Found",
                message: "Performance review was not found."
            });
        }


        if (
            review.status === "ACKNOWLEDGED"
        ) {

            return res.status(400).render("error", {
                title: "Cannot Cancel Review",
                message:
                    "An acknowledged performance review cannot be cancelled."
            });
        }


        review.status = "CANCELLED";

        review.updatedBy =
            req.session.user._id ||
            req.session.user.id;


        await review.save();


        return res.redirect(
            "/performance"
        );

    } catch (error) {

        console.error(
            "Cancel Performance Review Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Performance Error",
            message:
                "Unable to cancel performance review."
        });
    }
};


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    getPerformanceDashboard,
    getCreatePerformanceReview,
    createPerformanceReview,
    getPerformanceReview,
    getEditPerformanceReview,
    updatePerformanceReview,
    cancelPerformanceReview
};