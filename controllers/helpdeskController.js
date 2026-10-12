const mongoose = require("mongoose");

const Employee = require("../models/Employee");
const HelpdeskTicket = require("../models/HelpdeskTicket");


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
// GET CURRENT USER ID
// =====================================================

const getUserId = (req) => {

    return (
        req.session?.user?._id ||
        req.session?.user?.id ||
        null
    );
};


// =====================================================
// HELP DESK DASHBOARD
// GET /helpdesk
// =====================================================

const getHelpdeskDashboard = async (
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
        // TICKET COUNTS
        // =================================================

        const totalTickets =
            await HelpdeskTicket.countDocuments({
                organizationId
            });


        const openTickets =
            await HelpdeskTicket.countDocuments({
                organizationId,
                status: "OPEN"
            });


        const pendingTickets =
            await HelpdeskTicket.countDocuments({
                organizationId,
                status: "PENDING"
            });


        const inProgressTickets =
            await HelpdeskTicket.countDocuments({
                organizationId,
                status: "IN_PROGRESS"
            });


        const resolvedTickets =
            await HelpdeskTicket.countDocuments({
                organizationId,
                status: "RESOLVED"
            });


        const closedTickets =
            await HelpdeskTicket.countDocuments({
                organizationId,
                status: "CLOSED"
            });


        const urgentTickets =
            await HelpdeskTicket.countDocuments({
                organizationId,
                priority: "URGENT",
                status: {
                    $nin: [
                        "RESOLVED",
                        "CLOSED"
                    ]
                }
            });


        // =================================================
        // RECENT TICKETS
        // =================================================

        const tickets =
            await HelpdeskTicket.find({
                organizationId
            })
                .populate(
                    "employee",
                    "firstName lastName employeeId email"
                )
                .populate(
                    "assignedTo",
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
            "helpdesk/index",
            {
                title: "Helpdesk",

                user: req.session.user,

                tickets,

                totalTickets,
                openTickets,
                pendingTickets,
                inProgressTickets,
                resolvedTickets,
                closedTickets,
                urgentTickets,

                employeeCount
            }
        );

    } catch (error) {

        console.error(
            "Helpdesk Dashboard Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Helpdesk Error",
            message:
                "Unable to load helpdesk dashboard."
        });
    }
};


// =====================================================
// TICKET LIST
// GET /helpdesk/tickets
// =====================================================

const getTickets = async (
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
        // FILTERS
        // =================================================

        const {
            status,
            priority,
            category,
            search
        } = req.query;


        const filter = {
            organizationId
        };


        if (status) {

            filter.status = status;
        }


        if (priority) {

            filter.priority = priority;
        }


        if (category) {

            filter.category = category;
        }


        // =================================================
        // SEARCH
        // =================================================

        if (search) {

            filter.$or = [
                {
                    ticketNumber: {
                        $regex: search,
                        $options: "i"
                    }
                },
                {
                    subject: {
                        $regex: search,
                        $options: "i"
                    }
                },
                {
                    description: {
                        $regex: search,
                        $options: "i"
                    }
                }
            ];
        }


        const tickets =
            await HelpdeskTicket.find(filter)
                .populate(
                    "employee",
                    "firstName lastName employeeId email"
                )
                .populate(
                    "assignedTo",
                    "name email"
                )
                .sort({
                    createdAt: -1
                })
                .lean();


        return res.render(
            "helpdesk/tickets",
            {
                title: "Helpdesk Tickets",

                user: req.session.user,

                tickets,

                filters: {
                    status:
                        status || "",
                    priority:
                        priority || "",
                    category:
                        category || "",
                    search:
                        search || ""
                }
            }
        );

    } catch (error) {

        console.error(
            "Get Helpdesk Tickets Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Helpdesk Error",
            message:
                "Unable to load helpdesk tickets."
        });
    }
};


// =====================================================
// CREATE TICKET PAGE
// GET /helpdesk/create
// =====================================================

const getCreateTicket = async (
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
            "helpdesk/create",
            {
                title: "Create Helpdesk Ticket",

                user: req.session.user,

                employees,

                error: null,

                formData: {}
            }
        );

    } catch (error) {

        console.error(
            "Create Ticket Page Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Helpdesk Error",
            message:
                "Unable to load ticket form."
        });
    }
};


// =====================================================
// CREATE TICKET
// POST /helpdesk/create
// =====================================================

const createTicket = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const userId =
            getUserId(req);


        if (!organizationId) {

            return res.status(403).render("error", {
                title: "Access Denied",
                message:
                    "Organization information is missing."
            });
        }


        const {
            employee,
            subject,
            description,
            category,
            priority
        } = req.body;


        // =================================================
        // VALIDATION
        // =================================================

        if (
            !employee ||
            !subject ||
            !description
        ) {

            return res.status(400).render(
                "helpdesk/create",
                {
                    title: "Create Helpdesk Ticket",

                    user: req.session.user,

                    employees: [],

                    error:
                        "Employee, subject and description are required.",

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
            });


        if (!employeeRecord) {

            return res.status(400).render(
                "helpdesk/create",
                {
                    title: "Create Helpdesk Ticket",

                    user: req.session.user,

                    employees: [],

                    error:
                        "Selected employee was not found.",

                    formData: req.body
                }
            );
        }


        // =================================================
        // CREATE TICKET
        // =================================================

        const ticket =
            new HelpdeskTicket({

                organizationId,

                employee,

                subject:
                    subject.trim(),

                description:
                    description.trim(),

                category:
                    category || "GENERAL",

                priority:
                    priority || "MEDIUM",

                status:
                    "OPEN",

                createdBy:
                    userId
            });


        await ticket.save();


        return res.redirect(
            `/helpdesk/tickets/${ticket._id}`
        );

    } catch (error) {

        console.error(
            "Create Helpdesk Ticket Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Helpdesk Error",
            message:
                "Unable to create helpdesk ticket."
        });
    }
};


// =====================================================
// VIEW TICKET
// GET /helpdesk/tickets/:id
// =====================================================

const getTicket = async (
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
                title: "Ticket Not Found",
                message:
                    "Invalid ticket ID."
            });
        }


        const ticket =
            await HelpdeskTicket.findOne({
                _id: id,
                organizationId
            })
                .populate(
                    "employee",
                    "firstName lastName employeeId email department designation"
                )
                .populate(
                    "assignedTo",
                    "name email"
                )
                .populate(
                    "createdBy",
                    "name email"
                )
                .populate(
                    "comments.user",
                    "name email"
                )
                .lean();


        if (!ticket) {

            return res.status(404).render("error", {
                title: "Ticket Not Found",
                message:
                    "Helpdesk ticket was not found."
            });
        }


        return res.render(
            "helpdesk/view",
            {
                title:
                    ticket.ticketNumber ||
                    "Helpdesk Ticket",

                user: req.session.user,

                ticket
            }
        );

    } catch (error) {

        console.error(
            "Get Helpdesk Ticket Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Helpdesk Error",
            message:
                "Unable to load helpdesk ticket."
        });
    }
};


// =====================================================
// UPDATE TICKET STATUS
// POST /helpdesk/tickets/:id/status
// =====================================================

const updateTicketStatus = async (
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


        const allowedStatuses = [
            "OPEN",
            "PENDING",
            "IN_PROGRESS",
            "RESOLVED",
            "CLOSED"
        ];


        if (
            !allowedStatuses.includes(status)
        ) {

            return res.status(400).send(
                "Invalid ticket status."
            );
        }


        const ticket =
            await HelpdeskTicket.findOne({
                _id: id,
                organizationId
            });


        if (!ticket) {

            return res.status(404).render("error", {
                title: "Ticket Not Found",
                message:
                    "Helpdesk ticket was not found."
            });
        }


        ticket.status =
            status;


        if (
            status === "RESOLVED"
        ) {

            ticket.resolvedAt =
                new Date();

            ticket.resolvedBy =
                getUserId(req);
        }


        if (
            status === "CLOSED"
        ) {

            ticket.closedAt =
                new Date();

            ticket.closedBy =
                getUserId(req);
        }


        await ticket.save();


        return res.redirect(
            `/helpdesk/tickets/${ticket._id}`
        );

    } catch (error) {

        console.error(
            "Update Ticket Status Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Helpdesk Error",
            message:
                "Unable to update ticket status."
        });
    }
};


// =====================================================
// UPDATE PRIORITY
// POST /helpdesk/tickets/:id/priority
// =====================================================

const updateTicketPriority = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const { id } =
            req.params;

        const { priority } =
            req.body;


        const allowedPriorities = [
            "LOW",
            "MEDIUM",
            "HIGH",
            "URGENT"
        ];


        if (
            !allowedPriorities.includes(priority)
        ) {

            return res.status(400).send(
                "Invalid ticket priority."
            );
        }


        const ticket =
            await HelpdeskTicket.findOneAndUpdate(
                {
                    _id: id,
                    organizationId
                },
                {
                    $set: {
                        priority
                    }
                },
                {
                    new: true
                }
            );


        if (!ticket) {

            return res.status(404).render("error", {
                title: "Ticket Not Found",
                message:
                    "Helpdesk ticket was not found."
            });
        }


        return res.redirect(
            `/helpdesk/tickets/${ticket._id}`
        );

    } catch (error) {

        console.error(
            "Update Ticket Priority Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Helpdesk Error",
            message:
                "Unable to update ticket priority."
        });
    }
};


// =====================================================
// ASSIGN TICKET
// POST /helpdesk/tickets/:id/assign
// =====================================================

const assignTicket = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const { id } =
            req.params;

        const { assignedTo } =
            req.body;


        if (
            !mongoose.Types.ObjectId.isValid(id)
        ) {

            return res.status(400).send(
                "Invalid ticket ID."
            );
        }


        if (
            assignedTo &&
            !mongoose.Types.ObjectId.isValid(
                assignedTo
            )
        ) {

            return res.status(400).send(
                "Invalid assignee."
            );
        }


        const ticket =
            await HelpdeskTicket.findOne({
                _id: id,
                organizationId
            });


        if (!ticket) {

            return res.status(404).render("error", {
                title: "Ticket Not Found",
                message:
                    "Helpdesk ticket was not found."
            });
        }


        ticket.assignedTo =
            assignedTo || null;


        if (
            assignedTo &&
            ticket.status === "OPEN"
        ) {

            ticket.status =
                "IN_PROGRESS";
        }


        await ticket.save();


        return res.redirect(
            `/helpdesk/tickets/${ticket._id}`
        );

    } catch (error) {

        console.error(
            "Assign Ticket Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Helpdesk Error",
            message:
                "Unable to assign ticket."
        });
    }
};


// =====================================================
// ADD COMMENT
// POST /helpdesk/tickets/:id/comment
// =====================================================

const addComment = async (
    req,
    res
) => {

    try {

        const organizationId =
            getOrganizationId(req);

        const userId =
            getUserId(req);

        const { id } =
            req.params;

        const {
            comment
        } = req.body;


        if (!comment || !comment.trim()) {

            return res.status(400).send(
                "Comment cannot be empty."
            );
        }


        const ticket =
            await HelpdeskTicket.findOne({
                _id: id,
                organizationId
            });


        if (!ticket) {

            return res.status(404).render("error", {
                title: "Ticket Not Found",
                message:
                    "Helpdesk ticket was not found."
            });
        }


        if (!ticket.comments) {

            ticket.comments = [];
        }


        ticket.comments.push({
            user: userId,
            comment:
                comment.trim(),
            createdAt:
                new Date()
        });


        await ticket.save();


        return res.redirect(
            `/helpdesk/tickets/${ticket._id}`
        );

    } catch (error) {

        console.error(
            "Add Ticket Comment Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Helpdesk Error",
            message:
                "Unable to add comment."
        });
    }
};


// =====================================================
// DELETE TICKET
// POST /helpdesk/tickets/:id/delete
// =====================================================

const deleteTicket = async (
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
                title: "Ticket Not Found",
                message:
                    "Invalid ticket ID."
            });
        }


        const ticket =
            await HelpdeskTicket.findOne({
                _id: id,
                organizationId
            });


        if (!ticket) {

            return res.status(404).render("error", {
                title: "Ticket Not Found",
                message:
                    "Helpdesk ticket was not found."
            });
        }


        // =================================================
        // PROTECT RESOLVED/CLOSED TICKETS
        // =================================================

        if (
            ticket.status === "RESOLVED" ||
            ticket.status === "CLOSED"
        ) {

            return res.status(400).render("error", {
                title: "Cannot Delete Ticket",
                message:
                    "Resolved or closed tickets should be retained for audit history."
            });
        }


        await HelpdeskTicket.deleteOne({
            _id: id,
            organizationId
        });


        return res.redirect(
            "/helpdesk/tickets"
        );

    } catch (error) {

        console.error(
            "Delete Helpdesk Ticket Error:",
            error
        );

        return res.status(500).render("error", {
            title: "Helpdesk Error",
            message:
                "Unable to delete helpdesk ticket."
        });
    }
};


// =====================================================
// EXPORTS
// =====================================================

module.exports = {

    getHelpdeskDashboard,

    getTickets,

    getCreateTicket,

    createTicket,

    getTicket,

    updateTicketStatus,

    updateTicketPriority,

    assignTicket,

    addComment,

    deleteTicket

};