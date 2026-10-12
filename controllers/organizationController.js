const Department =
    require("../models/Department");

const Designation =
    require("../models/Designation");

const Branch =
    require("../models/Branch");

const Location =
    require("../models/Location");


// =====================================================
// ORGANIZATION SETUP PAGE
// =====================================================

exports.getOrganizationSetup =
    async (req, res) => {

        try {

            const [
                departments,
                designations,
                branches,
                locations
            ] = await Promise.all([

                Department.find()
                    .sort({ name: 1 }),

                Designation.find()
                    .sort({ name: 1 }),

                Branch.find()
                    .sort({ name: 1 }),

                Location.find()
                    .sort({ name: 1 })

            ]);


            // =================================================
            // USER
            // =================================================

            const user =
                req.session?.user || {

                    name: "Administrator",

                    role: "SUPER_ADMIN"

                };


            // =================================================
            // RENDER
            // =================================================

            res.render(
                "organization/index",
                {

                    title:
                        "Organization Setup",

                    user,

                    departments,

                    designations,

                    branches,

                    locations

                }
            );


        } catch (error) {

            console.error(
                "Organization Setup Error:",
                error
            );

            res.status(500).send(
                "Unable to load organization setup"
            );

        }

    };


// =====================================================
// ADD DEPARTMENT
// =====================================================

exports.createDepartment =
    async (req, res) => {

        try {

            const {
                name,
                code,
                description
            } = req.body;


            await Department.create({

                name:
                    name.trim(),

                code:
                    code.trim().toUpperCase(),

                description:
                    description?.trim() || "",

                status:
                    "Active"

            });


            res.redirect(
                "/organization"
            );


        } catch (error) {

            console.error(
                "Create Department Error:",
                error
            );

            res.status(500).send(
                "Unable to create department"
            );

        }

    };


// =====================================================
// ADD DESIGNATION
// =====================================================

exports.createDesignation =
    async (req, res) => {

        try {

            const {
                name,
                code,
                level
            } = req.body;


            await Designation.create({

                name:
                    name.trim(),

                code:
                    code.trim().toUpperCase(),

                level:
                    level || "Mid Level",

                status:
                    "Active"

            });


            res.redirect(
                "/organization"
            );


        } catch (error) {

            console.error(
                "Create Designation Error:",
                error
            );

            res.status(500).send(
                "Unable to create designation"
            );

        }

    };


// =====================================================
// ADD BRANCH
// =====================================================

exports.createBranch =
    async (req, res) => {

        try {

            const {
                name,
                code,
                city,
                state
            } = req.body;


            await Branch.create({

                name:
                    name.trim(),

                code:
                    code.trim().toUpperCase(),

                city:
                    city.trim(),

                state:
                    state?.trim() || "",

                status:
                    "Active"

            });


            res.redirect(
                "/organization"
            );


        } catch (error) {

            console.error(
                "Create Branch Error:",
                error
            );

            res.status(500).send(
                "Unable to create branch"
            );

        }

    };


// =====================================================
// ADD LOCATION
// =====================================================

exports.createLocation =
    async (req, res) => {

        try {

            const {
                name,
                city,
                address
            } = req.body;


            await Location.create({

                name:
                    name.trim(),

                city:
                    city.trim(),

                address:
                    address?.trim() || "",

                status:
                    "Active"

            });


            res.redirect(
                "/organization"
            );


        } catch (error) {

            console.error(
                "Create Location Error:",
                error
            );

            res.status(500).send(
                "Unable to create location"
            );

        }

    };