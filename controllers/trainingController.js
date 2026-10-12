const mongoose = require("mongoose");

const Employee = require("../models/Employee");
const Training = require("../models/Training");


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
// TRAINING DASHBOARD
// GET /training
// =====================================================

const getTrainingDashboard = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);

        if (!organizationId) {

            return res.status(403).render("error", {
                title: "Access Denied",
                message:
                    "Organization information is missing."
            });
        }


        // =================================================
        // TRAINING STATISTICS
        // =================================================

        const totalTrainings =
            await Training.countDocuments({
                organizationId
            });


        const activeTrainings =
            await Training.countDocuments({
                organizationId,
                status: "ACTIVE"
            });


        const completedTrainings =
            await Training.countDocuments({
                organizationId,
                status: "COMPLETED"
            });


        const upcomingTrainings =
            await Training.countDocuments({
                organizationId,
                status: "UPCOMING"
            });


        // =================================================
        // RECENT TRAININGS
        // =================================================

        const trainings =
            await Training.find({
                organizationId
            })
                .populate(
                    "trainer",
                    "name email"
                )
                .sort({
                    createdAt: -1
                })
                .limit(10)
                .lean();


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
            "training/index",
            {
                title: "Training & Development",

                user: req.session.user,

                trainings,

                totalTrainings,
                activeTrainings,
                completedTrainings,
                upcomingTrainings,

                employeeCount
            }
        );

    } catch (error) {

        console.error(
            "Training Dashboard Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Training Error",
            message:
                "Unable to load training dashboard."
        });
    }
};


// =====================================================
// TRAINING LIST
// GET /training/list
// =====================================================

const getTrainings = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);

        if (!organizationId) {

            return res.status(403).render("error", {
                title: "Access Denied",
                message:
                    "Organization information is missing."
            });
        }


        const trainings =
            await Training.find({
                organizationId
            })
                .populate(
                    "trainer",
                    "name email"
                )
                .sort({
                    startDate: -1,
                    createdAt: -1
                })
                .lean();


        return res.render(
            "training/list",
            {
                title: "Training Programs",

                user: req.session.user,

                trainings
            }
        );

    } catch (error) {

        console.error(
            "Get Trainings Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Training Error",
            message:
                "Unable to load training programs."
        });
    }
};


// =====================================================
// CREATE TRAINING PAGE
// GET /training/create
// =====================================================

const getCreateTraining = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        if (!organizationId) {

            return res.status(403).render("error", {
                title: "Access Denied",
                message:
                    "Organization information is missing."
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
            "training/create",
            {
                title: "Create Training",

                user: req.session.user,

                employees,

                error: null,

                formData: {}
            }
        );

    } catch (error) {

        console.error(
            "Create Training Page Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Training Error",
            message:
                "Unable to load training form."
        });
    }
};


// =====================================================
// CREATE TRAINING
// POST /training/create
// =====================================================

const createTraining = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        if (!organizationId) {

            return res.status(403).render("error", {
                title: "Access Denied",
                message:
                    "Organization information is missing."
            });
        }


        const {
            title,
            description,
            category,
            trainer,
            location,
            mode,
            startDate,
            endDate,
            duration,
            maxParticipants,
            cost,
            objectives,
            status
        } = req.body;


        // =================================================
        // VALIDATION
        // =================================================

        if (
            !title ||
            !startDate ||
            !endDate
        ) {

            return res.status(400).render(
                "training/create",
                {
                    title: "Create Training",

                    user: req.session.user,

                    employees: [],

                    error:
                        "Training title, start date and end date are required.",

                    formData: req.body
                }
            );
        }


        // =================================================
        // DATE VALIDATION
        // =================================================

        const trainingStart =
            new Date(startDate);

        const trainingEnd =
            new Date(endDate);


        if (
            Number.isNaN(
                trainingStart.getTime()
            ) ||
            Number.isNaN(
                trainingEnd.getTime()
            )
        ) {

            return res.status(400).render(
                "training/create",
                {
                    title: "Create Training",

                    user: req.session.user,

                    employees: [],

                    error:
                        "Please enter valid training dates.",

                    formData: req.body
                }
            );
        }


        if (trainingEnd < trainingStart) {

            return res.status(400).render(
                "training/create",
                {
                    title: "Create Training",

                    user: req.session.user,

                    employees: [],

                    error:
                        "Training end date cannot be before the start date.",

                    formData: req.body
                }
            );
        }


        // =================================================
        // NUMERIC VALUES
        // =================================================

        const participantLimit =
            Number(maxParticipants || 0);

        const trainingCost =
            Number(cost || 0);

        const trainingDuration =
            Number(duration || 0);


        if (
            !Number.isFinite(
                participantLimit
            ) ||
            !Number.isFinite(
                trainingCost
            ) ||
            !Number.isFinite(
                trainingDuration
            )
        ) {

            return res.status(400).render(
                "training/create",
                {
                    title: "Create Training",

                    user: req.session.user,

                    employees: [],

                    error:
                        "Please enter valid numeric values.",

                    formData: req.body
                }
            );
        }


        if (
            participantLimit < 0 ||
            trainingCost < 0 ||
            trainingDuration < 0
        ) {

            return res.status(400).render(
                "training/create",
                {
                    title: "Create Training",

                    user: req.session.user,

                    employees: [],

                    error:
                        "Numeric values cannot be negative.",

                    formData: req.body
                }
            );
        }


        // =================================================
        // PARTICIPANTS
        // =================================================

        let participants = [];

        if (req.body.participants) {

            participants =
                Array.isArray(
                    req.body.participants
                )
                    ? req.body.participants
                    : [req.body.participants];
        }


        // =================================================
        // VALIDATE PARTICIPANTS
        // =================================================

        if (participants.length > 0) {

            const validParticipants =
                await Employee.countDocuments({
                    _id: {
                        $in: participants
                    },
                    organizationId,
                    status: {
                        $ne: "Exited"
                    }
                });


            if (
                validParticipants !==
                participants.length
            ) {

                return res.status(400).render(
                    "training/create",
                    {
                        title: "Create Training",

                        user: req.session.user,

                        employees: [],

                        error:
                            "One or more selected employees are invalid.",

                        formData: req.body
                    }
                );
            }
        }


        // =================================================
        // CREATE TRAINING
        // =================================================

        const training =
            await Training.create({

                organizationId,

                title:
                    title.trim(),

                description:
                    description?.trim() || "",

                category:
                    category?.trim() || "",

                trainer:
                    trainer || null,

                location:
                    location?.trim() || "",

                mode:
                    mode || "OFFLINE",

                startDate:
                    trainingStart,

                endDate:
                    trainingEnd,

                duration:
                    trainingDuration,

                maxParticipants:
                    participantLimit,

                cost:
                    trainingCost,

                objectives:
                    objectives
                        ? objectives
                            .split("\n")
                            .map(item => item.trim())
                            .filter(Boolean)
                        : [],

                participants,

                status:
                    status || "UPCOMING",

                createdBy:
                    req.session.user._id ||
                    req.session.user.id
            });


        return res.redirect(
            `/training/${training._id}`
        );

    } catch (error) {

        console.error(
            "Create Training Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Training Error",
            message:
                "Unable to create training program."
        });
    }
};


// =====================================================
// VIEW TRAINING
// GET /training/:id
// =====================================================

const getTraining = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const { id } =
            req.params;


        if (
            !mongoose.Types.ObjectId.isValid(id)
        ) {

            return res.status(404).render("error", {
                title: "Training Not Found",
                message:
                    "Invalid training ID."
            });
        }


        const training =
            await Training.findOne({
                _id: id,
                organizationId
            })
                .populate(
                    "trainer",
                    "name email"
                )
                .populate(
                    "participants",
                    "firstName lastName employeeId email department designation"
                )
                .populate(
                    "createdBy",
                    "name email"
                )
                .lean();


        if (!training) {

            return res.status(404).render("error", {
                title: "Training Not Found",
                message:
                    "Training program was not found."
            });
        }


        return res.render(
            "training/view",
            {
                title: training.title,

                user: req.session.user,

                training
            }
        );

    } catch (error) {

        console.error(
            "Get Training Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Training Error",
            message:
                "Unable to load training program."
        });
    }
};


// =====================================================
// EDIT TRAINING PAGE
// GET /training/:id/edit
// =====================================================

const getEditTraining = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const { id } =
            req.params;


        if (
            !mongoose.Types.ObjectId.isValid(id)
        ) {

            return res.status(404).render("error", {
                title: "Training Not Found",
                message:
                    "Invalid training ID."
            });
        }


        const training =
            await Training.findOne({
                _id: id,
                organizationId
            })
                .populate(
                    "participants",
                    "firstName lastName employeeId email"
                )
                .lean();


        if (!training) {

            return res.status(404).render("error", {
                title: "Training Not Found",
                message:
                    "Training program was not found."
            });
        }


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


        return res.render(
            "training/edit",
            {
                title: "Edit Training",

                user: req.session.user,

                training,

                employees,

                error: null
            }
        );

    } catch (error) {

        console.error(
            "Edit Training Page Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Training Error",
            message:
                "Unable to load training edit page."
        });
    }
};


// =====================================================
// UPDATE TRAINING
// POST /training/:id/edit
// =====================================================

const updateTraining = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const { id } =
            req.params;


        if (
            !mongoose.Types.ObjectId.isValid(id)
        ) {

            return res.status(404).render("error", {
                title: "Training Not Found",
                message:
                    "Invalid training ID."
            });
        }


        const training =
            await Training.findOne({
                _id: id,
                organizationId
            });


        if (!training) {

            return res.status(404).render("error", {
                title: "Training Not Found",
                message:
                    "Training program was not found."
            });
        }


        // =================================================
        // UPDATE BASIC DATA
        // =================================================

        if (req.body.title) {

            training.title =
                req.body.title.trim();
        }


        training.description =
            req.body.description?.trim() || "";


        training.category =
            req.body.category?.trim() || "";


        training.location =
            req.body.location?.trim() || "";


        training.mode =
            req.body.mode ||
            training.mode;


        training.trainer =
            req.body.trainer ||
            null;


        // =================================================
        // DATES
        // =================================================

        if (req.body.startDate) {

            training.startDate =
                new Date(
                    req.body.startDate
                );
        }


        if (req.body.endDate) {

            training.endDate =
                new Date(
                    req.body.endDate
                );
        }


        if (
            training.endDate <
            training.startDate
        ) {

            throw new Error(
                "Training end date cannot be before the start date."
            );
        }


        // =================================================
        // NUMERIC VALUES
        // =================================================

        if (
            req.body.duration !== undefined
        ) {

            training.duration =
                Number(
                    req.body.duration || 0
                );
        }


        if (
            req.body.maxParticipants !==
            undefined
        ) {

            training.maxParticipants =
                Number(
                    req.body.maxParticipants || 0
                );
        }


        if (
            req.body.cost !== undefined
        ) {

            training.cost =
                Number(
                    req.body.cost || 0
                );
        }


        // =================================================
        // OBJECTIVES
        // =================================================

        if (req.body.objectives !== undefined) {

            training.objectives =
                req.body.objectives
                    .split("\n")
                    .map(item => item.trim())
                    .filter(Boolean);
        }


        // =================================================
        // PARTICIPANTS
        // =================================================

        let participants = [];

        if (req.body.participants) {

            participants =
                Array.isArray(
                    req.body.participants
                )
                    ? req.body.participants
                    : [req.body.participants];
        }


        if (participants.length > 0) {

            const validParticipants =
                await Employee.countDocuments({
                    _id: {
                        $in: participants
                    },
                    organizationId,
                    status: {
                        $ne: "Exited"
                    }
                });


            if (
                validParticipants !==
                participants.length
            ) {

                throw new Error(
                    "One or more selected employees are invalid."
                );
            }
        }


        training.participants =
            participants;


        // =================================================
        // STATUS
        // =================================================

        if (req.body.status) {

            training.status =
                req.body.status;
        }


        training.updatedBy =
            req.session.user._id ||
            req.session.user.id;


        await training.save();


        return res.redirect(
            `/training/${training._id}`
        );

    } catch (error) {

        console.error(
            "Update Training Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Training Error",
            message:
                error.message ||
                "Unable to update training program."
        });
    }
};


// =====================================================
// DELETE TRAINING
// POST /training/:id/delete
// =====================================================

const deleteTraining = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const { id } =
            req.params;


        if (
            !mongoose.Types.ObjectId.isValid(id)
        ) {

            return res.status(404).render("error", {
                title: "Training Not Found",
                message:
                    "Invalid training ID."
            });
        }


        const training =
            await Training.findOne({
                _id: id,
                organizationId
            });


        if (!training) {

            return res.status(404).render("error", {
                title: "Training Not Found",
                message:
                    "Training program was not found."
            });
        }


        // =================================================
        // PROTECT COMPLETED TRAINING
        // =================================================

        if (
            training.status === "COMPLETED"
        ) {

            return res.status(400).render("error", {
                title: "Cannot Delete Training",
                message:
                    "Completed training programs cannot be deleted."
            });
        }


        await Training.deleteOne({
            _id: id,
            organizationId
        });


        return res.redirect(
            "/training/list"
        );

    } catch (error) {

        console.error(
            "Delete Training Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Training Error",
            message:
                "Unable to delete training program."
        });
    }
};


// =====================================================
// ENROLL EMPLOYEE
// POST /training/:id/enroll
// =====================================================

const enrollEmployee = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const { id } =
            req.params;

        const { employeeId } =
            req.body;


        if (
            !mongoose.Types.ObjectId.isValid(id) ||
            !mongoose.Types.ObjectId.isValid(employeeId)
        ) {

            return res.status(400).send(
                "Invalid training or employee ID."
            );
        }


        const training =
            await Training.findOne({
                _id: id,
                organizationId
            });


        if (!training) {

            return res.status(404).send(
                "Training program not found."
            );
        }


        if (
            training.status === "COMPLETED" ||
            training.status === "CANCELLED"
        ) {

            return res.status(400).send(
                "Employees cannot be enrolled in this training."
            );
        }


        const employee =
            await Employee.findOne({
                _id: employeeId,
                organizationId,
                status: {
                    $ne: "Exited"
                }
            });


        if (!employee) {

            return res.status(404).send(
                "Employee not found."
            );
        }


        // =================================================
        // PREVENT DUPLICATE ENROLLMENT
        // =================================================

        const alreadyEnrolled =
            training.participants.some(
                participant =>
                    participant.toString() ===
                    employeeId.toString()
            );


        if (alreadyEnrolled) {

            return res.status(400).send(
                "Employee is already enrolled."
            );
        }


        // =================================================
        // CHECK CAPACITY
        // =================================================

        if (
            training.maxParticipants > 0 &&
            training.participants.length >=
            training.maxParticipants
        ) {

            return res.status(400).send(
                "Training participant capacity is full."
            );
        }


        training.participants.push(
            employeeId
        );


        await training.save();


        return res.redirect(
            `/training/${training._id}`
        );

    } catch (error) {

        console.error(
            "Enroll Employee Error:",
            error
        );

        return res.status(500).send(
            "Unable to enroll employee."
        );
    }
};


// =====================================================
// REMOVE EMPLOYEE FROM TRAINING
// POST /training/:id/remove
// =====================================================

const removeEmployee = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const { id } =
            req.params;

        const { employeeId } =
            req.body;


        const training =
            await Training.findOne({
                _id: id,
                organizationId
            });


        if (!training) {

            return res.status(404).send(
                "Training program not found."
            );
        }


        training.participants =
            training.participants.filter(
                participant =>
                    participant.toString() !==
                    employeeId.toString()
            );


        await training.save();


        return res.redirect(
            `/training/${training._id}`
        );

    } catch (error) {

        console.error(
            "Remove Employee Error:",
            error
        );

        return res.status(500).send(
            "Unable to remove employee from training."
        );
    }
};


// =====================================================
// EXPORTS
// =====================================================

module.exports = {

    getTrainingDashboard,

    getTrainings,

    getCreateTraining,

    createTraining,

    getTraining,

    getEditTraining,

    updateTraining,

    deleteTraining,

    enrollEmployee,

    removeEmployee

};