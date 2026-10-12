const mongoose = require("mongoose");

const Job = require("../models/Job");
const Candidate = require("../models/Candidate");


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
// RECRUITMENT DASHBOARD
// GET /recruitment
// =====================================================

const getRecruitmentDashboard = async (req, res) => {

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
        // JOB STATISTICS
        // =================================================

        const totalJobs =
            await Job.countDocuments({
                organizationId
            });

        const activeJobs =
            await Job.countDocuments({
                organizationId,
                status: "OPEN"
            });

        const closedJobs =
            await Job.countDocuments({
                organizationId,
                status: "CLOSED"
            });


        // =================================================
        // CANDIDATE STATISTICS
        // =================================================

        const totalCandidates =
            await Candidate.countDocuments({
                organizationId
            });

        const newCandidates =
            await Candidate.countDocuments({
                organizationId,
                status: "NEW"
            });

        const shortlistedCandidates =
            await Candidate.countDocuments({
                organizationId,
                status: "SHORTLISTED"
            });

        const interviewedCandidates =
            await Candidate.countDocuments({
                organizationId,
                status: "INTERVIEW"
            });

        const hiredCandidates =
            await Candidate.countDocuments({
                organizationId,
                status: "HIRED"
            });


        // =================================================
        // RECENT JOBS
        // =================================================

        const jobs =
            await Job.find({
                organizationId
            })
                .sort({
                    createdAt: -1
                })
                .limit(10)
                .lean();


        // =================================================
        // RECENT CANDIDATES
        // =================================================

        const candidates =
            await Candidate.find({
                organizationId
            })
                .populate(
                    "job",
                    "title department"
                )
                .sort({
                    createdAt: -1
                })
                .limit(10)
                .lean();


        // =================================================
        // RENDER
        // =================================================

        return res.render(
            "recruitment/index",
            {
                title: "Recruitment",

                user: req.session.user,

                jobs,
                candidates,

                totalJobs,
                activeJobs,
                closedJobs,

                totalCandidates,
                newCandidates,
                shortlistedCandidates,
                interviewedCandidates,
                hiredCandidates
            }
        );

    } catch (error) {

        console.error(
            "Recruitment Dashboard Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Recruitment Error",
            message:
                "Unable to load recruitment dashboard."
        });
    }
};


// =====================================================
// JOB LIST
// GET /recruitment/jobs
// =====================================================

const getJobs = async (req, res) => {

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


        const jobs =
            await Job.find({
                organizationId
            })
                .sort({
                    createdAt: -1
                })
                .lean();


        return res.render(
            "recruitment/jobs",
            {
                title: "Job Openings",

                user: req.session.user,

                jobs
            }
        );

    } catch (error) {

        console.error(
            "Get Jobs Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Recruitment Error",
            message:
                "Unable to load job openings."
        });
    }
};


// =====================================================
// CREATE JOB PAGE
// GET /recruitment/jobs/create
// =====================================================

const getCreateJob = async (req, res) => {

    return res.render(
        "recruitment/create-job",
        {
            title: "Create Job",

            user: req.session.user,

            error: null,

            formData: {}
        }
    );
};


// =====================================================
// CREATE JOB
// POST /recruitment/jobs/create
// =====================================================

const createJob = async (req, res) => {

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
            department,
            designation,
            location,
            employmentType,
            experience,
            salaryMin,
            salaryMax,
            description,
            requirements,
            skills,
            openings,
            applicationDeadline
        } = req.body;


        // =================================================
        // VALIDATION
        // =================================================

        if (!title || !department) {

            return res.status(400).render(
                "recruitment/create-job",
                {
                    title: "Create Job",

                    user: req.session.user,

                    error:
                        "Job title and department are required.",

                    formData: req.body
                }
            );
        }


        // =================================================
        // NUMERIC VALUES
        // =================================================

        const minSalary =
            Number(salaryMin || 0);

        const maxSalary =
            Number(salaryMax || 0);

        const totalOpenings =
            Number(openings || 1);


        if (
            !Number.isFinite(minSalary) ||
            !Number.isFinite(maxSalary) ||
            !Number.isFinite(totalOpenings)
        ) {

            return res.status(400).render(
                "recruitment/create-job",
                {
                    title: "Create Job",

                    user: req.session.user,

                    error:
                        "Please enter valid numeric values.",

                    formData: req.body
                }
            );
        }


        if (
            minSalary < 0 ||
            maxSalary < 0 ||
            totalOpenings < 1
        ) {

            return res.status(400).render(
                "recruitment/create-job",
                {
                    title: "Create Job",

                    user: req.session.user,

                    error:
                        "Salary and opening values cannot be negative.",

                    formData: req.body
                }
            );
        }


        if (
            maxSalary > 0 &&
            minSalary > maxSalary
        ) {

            return res.status(400).render(
                "recruitment/create-job",
                {
                    title: "Create Job",

                    user: req.session.user,

                    error:
                        "Minimum salary cannot be greater than maximum salary.",

                    formData: req.body
                }
            );
        }


        // =================================================
        // CREATE JOB
        // =================================================

        const job =
            await Job.create({

                organizationId,

                title:
                    title.trim(),

                department:
                    department.trim(),

                designation:
                    designation?.trim() || "",

                location:
                    location?.trim() || "",

                employmentType:
                    employmentType || "FULL_TIME",

                experience:
                    experience?.trim() || "",

                salaryMin:
                    minSalary,

                salaryMax:
                    maxSalary,

                description:
                    description?.trim() || "",

                requirements:
                    requirements?.trim() || "",

                skills:
                    skills
                        ? skills
                            .split(",")
                            .map(skill => skill.trim())
                            .filter(Boolean)
                        : [],

                openings:
                    totalOpenings,

                applicationDeadline:
                    applicationDeadline
                        ? new Date(applicationDeadline)
                        : null,

                status: "OPEN",

                createdBy:
                    req.session.user._id ||
                    req.session.user.id
            });


        return res.redirect(
            `/recruitment/jobs/${job._id}`
        );

    } catch (error) {

        console.error(
            "Create Job Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Recruitment Error",
            message:
                "Unable to create job opening."
        });
    }
};


// =====================================================
// VIEW JOB
// GET /recruitment/jobs/:id
// =====================================================

const getJob = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const { id } =
            req.params;


        if (
            !mongoose.Types.ObjectId.isValid(id)
        ) {

            return res.status(404).render("error", {
                title: "Job Not Found",
                message:
                    "Invalid job ID."
            });
        }


        const job =
            await Job.findOne({
                _id: id,
                organizationId
            })
                .populate(
                    "createdBy",
                    "name email"
                )
                .lean();


        if (!job) {

            return res.status(404).render("error", {
                title: "Job Not Found",
                message:
                    "Job opening was not found."
            });
        }


        const candidates =
            await Candidate.find({
                organizationId,
                job: job._id
            })
                .sort({
                    createdAt: -1
                })
                .lean();


        return res.render(
            "recruitment/job-view",
            {
                title: job.title,

                user: req.session.user,

                job,
                candidates
            }
        );

    } catch (error) {

        console.error(
            "Get Job Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Recruitment Error",
            message:
                "Unable to load job."
        });
    }
};


// =====================================================
// CANDIDATE LIST
// GET /recruitment/candidates
// =====================================================

const getCandidates = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);


        const candidates =
            await Candidate.find({
                organizationId
            })
                .populate(
                    "job",
                    "title department"
                )
                .sort({
                    createdAt: -1
                })
                .lean();


        return res.render(
            "recruitment/candidates",
            {
                title: "Candidates",

                user: req.session.user,

                candidates
            }
        );

    } catch (error) {

        console.error(
            "Get Candidates Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Recruitment Error",
            message:
                "Unable to load candidates."
        });
    }
};


// =====================================================
// VIEW CANDIDATE
// GET /recruitment/candidates/:id
// =====================================================

const getCandidate = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const { id } =
            req.params;


        if (
            !mongoose.Types.ObjectId.isValid(id)
        ) {

            return res.status(404).render("error", {
                title: "Candidate Not Found",
                message:
                    "Invalid candidate ID."
            });
        }


        const candidate =
            await Candidate.findOne({
                _id: id,
                organizationId
            })
                .populate(
                    "job",
                    "title department designation location"
                )
                .lean();


        if (!candidate) {

            return res.status(404).render("error", {
                title: "Candidate Not Found",
                message:
                    "Candidate was not found."
            });
        }


        return res.render(
            "recruitment/candidate-view",
            {
                title: "Candidate Profile",

                user: req.session.user,

                candidate
            }
        );

    } catch (error) {

        console.error(
            "Get Candidate Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Recruitment Error",
            message:
                "Unable to load candidate."
        });
    }
};


// =====================================================
// UPDATE CANDIDATE STATUS
// POST /recruitment/candidates/:id/status
// =====================================================

const updateCandidateStatus = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const { id } =
            req.params;

        const { status } =
            req.body;


        if (
            !mongoose.Types.ObjectId.isValid(id)
        ) {

            return res.status(404).render("error", {
                title: "Candidate Not Found",
                message:
                    "Invalid candidate ID."
            });
        }


        const allowedStatuses = [
            "NEW",
            "SCREENING",
            "SHORTLISTED",
            "INTERVIEW",
            "SELECTED",
            "HIRED",
            "REJECTED",
            "WITHDRAWN"
        ];


        if (
            !allowedStatuses.includes(status)
        ) {

            return res.status(400).send(
                "Invalid candidate status."
            );
        }


        const candidate =
            await Candidate.findOneAndUpdate(
                {
                    _id: id,
                    organizationId
                },
                {
                    $set: {
                        status
                    }
                },
                {
                    new: true
                }
            );


        if (!candidate) {

            return res.status(404).render("error", {
                title: "Candidate Not Found",
                message:
                    "Candidate was not found."
            });
        }


        return res.redirect(
            `/recruitment/candidates/${candidate._id}`
        );

    } catch (error) {

        console.error(
            "Update Candidate Status Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Recruitment Error",
            message:
                "Unable to update candidate status."
        });
    }
};


// =====================================================
// CLOSE JOB
// POST /recruitment/jobs/:id/close
// =====================================================

const closeJob = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const { id } =
            req.params;


        if (
            !mongoose.Types.ObjectId.isValid(id)
        ) {

            return res.status(404).render("error", {
                title: "Job Not Found",
                message:
                    "Invalid job ID."
            });
        }


        const job =
            await Job.findOneAndUpdate(
                {
                    _id: id,
                    organizationId
                },
                {
                    $set: {
                        status: "CLOSED"
                    }
                },
                {
                    new: true
                }
            );


        if (!job) {

            return res.status(404).render("error", {
                title: "Job Not Found",
                message:
                    "Job opening was not found."
            });
        }


        return res.redirect(
            `/recruitment/jobs/${job._id}`
        );

    } catch (error) {

        console.error(
            "Close Job Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Recruitment Error",
            message:
                "Unable to close job."
        });
    }
};


// =====================================================
// DELETE JOB
// POST /recruitment/jobs/:id/delete
// =====================================================

const deleteJob = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const { id } =
            req.params;


        if (
            !mongoose.Types.ObjectId.isValid(id)
        ) {

            return res.status(404).render("error", {
                title: "Job Not Found",
                message:
                    "Invalid job ID."
            });
        }


        const job =
            await Job.findOne({
                _id: id,
                organizationId
            });


        if (!job) {

            return res.status(404).render("error", {
                title: "Job Not Found",
                message:
                    "Job opening was not found."
            });
        }


        // =================================================
        // DO NOT DELETE JOB WITH CANDIDATES
        // =================================================

        const candidateCount =
            await Candidate.countDocuments({
                organizationId,
                job: id
            });


        if (candidateCount > 0) {

            return res.status(400).render("error", {
                title: "Cannot Delete Job",
                message:
                    "This job has candidates associated with it. Close the job instead of deleting it."
            });
        }


        await Job.deleteOne({
            _id: id,
            organizationId
        });


        return res.redirect(
            "/recruitment/jobs"
        );

    } catch (error) {

        console.error(
            "Delete Job Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Recruitment Error",
            message:
                "Unable to delete job."
        });
    }
};


// =====================================================
// EXPORTS
// =====================================================

module.exports = {

    getRecruitmentDashboard,

    getJobs,

    getCreateJob,

    createJob,

    getJob,

    getCandidates,

    getCandidate,

    updateCandidateStatus,

    closeJob,

    deleteJob

};