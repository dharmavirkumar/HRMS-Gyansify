const Asset = require("../models/Asset");
const Employee = require("../models/Employee");


// =====================================================
// HELPER
// =====================================================

const getOrganizationId = (req) => {

    const user = req.session?.user;

    if (!user) {
        return null;
    }

    return user.organizationId || user.organization || null;
};


// =====================================================
// ASSET LIST
// GET /assets
// =====================================================

exports.getAssets = async (req, res) => {

    try {

        const user = req.session.user;

        const organizationId =
            getOrganizationId(req);

        if (!organizationId) {
            return res.status(400).send(
                "Organization not found"
            );
        }


        // ---------------------------------------------
        // SEARCH
        // ---------------------------------------------

        const search =
            typeof req.query.search === "string"
                ? req.query.search.trim()
                : "";


        // ---------------------------------------------
        // FILTERS
        // ---------------------------------------------

        const selectedStatus =
            typeof req.query.status === "string"
                ? req.query.status.trim()
                : "";


        const selectedCategory =
            typeof req.query.category === "string"
                ? req.query.category.trim()
                : "";


        // ---------------------------------------------
        // QUERY
        // ---------------------------------------------

        const query = {
            organization: organizationId
        };


        // Search
        if (search) {

            query.$or = [

                {
                    assetId: {
                        $regex: search,
                        $options: "i"
                    }
                },

                {
                    name: {
                        $regex: search,
                        $options: "i"
                    }
                },

                {
                    brand: {
                        $regex: search,
                        $options: "i"
                    }
                },

                {
                    model: {
                        $regex: search,
                        $options: "i"
                    }
                },

                {
                    serialNumber: {
                        $regex: search,
                        $options: "i"
                    }
                }

            ];

        }


        // Status
        if (selectedStatus) {
            query.status = selectedStatus;
        }


        // Category
        if (selectedCategory) {
            query.category = selectedCategory;
        }


        // ---------------------------------------------
        // GET ASSETS
        // ---------------------------------------------

        const assets = await Asset.find(query)
            .populate(
                "assignedTo",
                "firstName lastName employeeId"
            )
            .sort({
                createdAt: -1
            });


        // ---------------------------------------------
        // STATISTICS
        // ---------------------------------------------

        const totalAssets =
            await Asset.countDocuments({
                organization: organizationId
            });


        const availableAssets =
            await Asset.countDocuments({
                organization: organizationId,
                status: "AVAILABLE"
            });


        const assignedAssets =
            await Asset.countDocuments({
                organization: organizationId,
                status: "ASSIGNED"
            });


        const maintenanceAssets =
            await Asset.countDocuments({
                organization: organizationId,
                status: "MAINTENANCE"
            });


        // ---------------------------------------------
        // RENDER
        // ---------------------------------------------

        return res.render(
            "assets/index",
            {
                title: "Assets",

                user,

                assets,

                stats: {
                    totalAssets,
                    availableAssets,
                    assignedAssets,
                    maintenanceAssets
                },

                search,

                selectedStatus,

                selectedCategory
            }
        );


    } catch (error) {

        console.error(
            "GET ASSETS ERROR:",
            error
        );

        return res.status(500).send(
            "Internal Server Error"
        );
    }
};



// =====================================================
// CREATE ASSET PAGE
// GET /assets/create
// =====================================================

exports.getCreateAsset = async (req, res) => {

    try {

        const user = req.session.user;

        const organizationId =
            getOrganizationId(req);


        if (!organizationId) {
            return res.status(400).send(
                "Organization not found"
            );
        }


        // ---------------------------------------------
        // GET EMPLOYEES
        // ---------------------------------------------

        const employees =
            await Employee.find({
                organization: organizationId
            })
            .sort({
                firstName: 1
            });


        return res.render(
            "assets/create",
            {
                title: "Add Asset",

                user,

                employees,

                error: null,

                formData: {}
            }
        );


    } catch (error) {

        console.error(
            "GET CREATE ASSET ERROR:",
            error
        );

        return res.status(500).send(
            "Internal Server Error"
        );
    }
};



// =====================================================
// CREATE ASSET
// POST /assets/create
// =====================================================

exports.createAsset = async (req, res) => {

    try {

        const user = req.session.user;

        const organizationId =
            getOrganizationId(req);


        if (!organizationId) {
            return res.status(400).send(
                "Organization not found"
            );
        }


        // ---------------------------------------------
        // FORM DATA
        // ---------------------------------------------

        const {
            assetId,
            name,
            category,
            brand,
            model,
            serialNumber,
            purchaseDate,
            purchasePrice,
            assignedTo,
            assignedDate,
            condition,
            status,
            location,
            description
        } = req.body;


        // ---------------------------------------------
        // VALIDATION
        // ---------------------------------------------

        if (!assetId || !name || !category) {

            const employees =
                await Employee.find({
                    organization: organizationId
                }).sort({
                    firstName: 1
                });


            return res.status(400).render(
                "assets/create",
                {
                    title: "Add Asset",

                    user,

                    employees,

                    error:
                        "Asset ID, Asset Name and Category are required.",

                    formData: req.body
                }
            );
        }


        // ---------------------------------------------
        // DUPLICATE ASSET ID
        // ---------------------------------------------

        const existingAsset =
            await Asset.findOne({
                organization: organizationId,
                assetId: assetId.trim()
            });


        if (existingAsset) {

            const employees =
                await Employee.find({
                    organization: organizationId
                }).sort({
                    firstName: 1
                });


            return res.status(400).render(
                "assets/create",
                {
                    title: "Add Asset",

                    user,

                    employees,

                    error:
                        "This Asset ID already exists.",

                    formData: req.body
                }
            );
        }


        // ---------------------------------------------
        // ASSIGNMENT VALIDATION
        // ---------------------------------------------

        let finalAssignedTo = null;

        let finalStatus =
            status || "AVAILABLE";


        if (assignedTo) {

            const employee =
                await Employee.findOne({
                    _id: assignedTo,
                    organization: organizationId
                });


            if (!employee) {

                const employees =
                    await Employee.find({
                        organization: organizationId
                    }).sort({
                        firstName: 1
                    });


                return res.status(400).render(
                    "assets/create",
                    {
                        title: "Add Asset",

                        user,

                        employees,

                        error:
                            "Selected employee is invalid.",

                        formData: req.body
                    }
                );
            }


            finalAssignedTo = employee._id;

            finalStatus = "ASSIGNED";
        }


        // ---------------------------------------------
        // CREATE ASSET
        // ---------------------------------------------

        const asset =
            new Asset({

                organization: organizationId,

                assetId:
                    assetId.trim(),

                name:
                    name.trim(),

                category:
                    category.trim(),

                brand:
                    brand
                        ? brand.trim()
                        : "",

                model:
                    model
                        ? model.trim()
                        : "",

                serialNumber:
                    serialNumber
                        ? serialNumber.trim()
                        : "",

                purchaseDate:
                    purchaseDate || null,

                purchasePrice:
                    purchasePrice
                        ? Number(purchasePrice)
                        : 0,

                assignedTo:
                    finalAssignedTo,

                assignedDate:
                    assignedDate || (
                        finalAssignedTo
                            ? new Date()
                            : null
                    ),

                condition:
                    condition || "NEW",

                status:
                    finalStatus,

                location:
                    location
                        ? location.trim()
                        : "",

                description:
                    description
                        ? description.trim()
                        : ""

            });


        await asset.save();


        // ---------------------------------------------
        // SUCCESS
        // ---------------------------------------------

        return res.redirect(
            "/assets"
        );


    } catch (error) {

        console.error(
            "CREATE ASSET ERROR:",
            error
        );

        return res.status(500).send(
            "Unable to create asset"
        );
    }
};



// =====================================================
// VIEW ASSET
// GET /assets/:id
// =====================================================

exports.getAsset = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);


        if (!organizationId) {
            return res.status(400).send(
                "Organization not found"
            );
        }


        const asset =
            await Asset.findOne({
                _id: req.params.id,
                organization: organizationId
            })
            .populate(
                "assignedTo",
                "firstName lastName employeeId email phone"
            );


        if (!asset) {
            return res.status(404).render(
                "errors/404",
                {
                    title: "Asset Not Found",
                    user: req.session.user
                }
            );
        }


        return res.render(
            "assets/view",
            {
                title: "Asset Details",

                user: req.session.user,

                asset
            }
        );


    } catch (error) {

        console.error(
            "GET ASSET ERROR:",
            error
        );

        return res.status(500).send(
            "Internal Server Error"
        );
    }
};



// =====================================================
// EDIT ASSET PAGE
// GET /assets/:id/edit
// =====================================================

exports.getEditAsset = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);


        if (!organizationId) {
            return res.status(400).send(
                "Organization not found"
            );
        }


        const asset =
            await Asset.findOne({
                _id: req.params.id,
                organization: organizationId
            });


        if (!asset) {
            return res.status(404).send(
                "Asset not found"
            );
        }


        const employees =
            await Employee.find({
                organization: organizationId
            })
            .sort({
                firstName: 1
            });


        return res.render(
            "assets/edit",
            {
                title: "Edit Asset",

                user: req.session.user,

                asset,

                employees,

                error: null
            }
        );


    } catch (error) {

        console.error(
            "GET EDIT ASSET ERROR:",
            error
        );

        return res.status(500).send(
            "Internal Server Error"
        );
    }
};



// =====================================================
// UPDATE ASSET
// POST /assets/:id/edit
// =====================================================

exports.updateAsset = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);


        if (!organizationId) {
            return res.status(400).send(
                "Organization not found"
            );
        }


        const {
            name,
            category,
            brand,
            model,
            serialNumber,
            purchaseDate,
            purchasePrice,
            assignedTo,
            assignedDate,
            condition,
            status,
            location,
            description
        } = req.body;


        const asset =
            await Asset.findOne({
                _id: req.params.id,
                organization: organizationId
            });


        if (!asset) {
            return res.status(404).send(
                "Asset not found"
            );
        }


        let finalAssignedTo =
            assignedTo || null;


        let finalStatus =
            status || "AVAILABLE";


        if (finalAssignedTo) {

            const employee =
                await Employee.findOne({
                    _id: finalAssignedTo,
                    organization: organizationId
                });


            if (!employee) {
                return res.status(400).send(
                    "Invalid employee selected"
                );
            }


            finalStatus = "ASSIGNED";

        } else {

            finalStatus = "AVAILABLE";
        }


        asset.name =
            name?.trim();

        asset.category =
            category?.trim();

        asset.brand =
            brand?.trim() || "";

        asset.model =
            model?.trim() || "";

        asset.serialNumber =
            serialNumber?.trim() || "";

        asset.purchaseDate =
            purchaseDate || null;

        asset.purchasePrice =
            purchasePrice
                ? Number(purchasePrice)
                : 0;

        asset.assignedTo =
            finalAssignedTo;

        asset.assignedDate =
            assignedDate ||
            (
                finalAssignedTo
                    ? new Date()
                    : null
            );

        asset.condition =
            condition || "NEW";

        asset.status =
            finalStatus;

        asset.location =
            location?.trim() || "";

        asset.description =
            description?.trim() || "";


        await asset.save();


        return res.redirect(
            `/assets/${asset._id}`
        );


    } catch (error) {

        console.error(
            "UPDATE ASSET ERROR:",
            error
        );

        return res.status(500).send(
            "Unable to update asset"
        );
    }
};



// =====================================================
// DELETE / RETIRE ASSET
// POST /assets/:id/delete
// =====================================================

exports.deleteAsset = async (req, res) => {

    try {

        const organizationId =
            getOrganizationId(req);


        if (!organizationId) {
            return res.status(400).send(
                "Organization not found"
            );
        }


        const asset =
            await Asset.findOne({
                _id: req.params.id,
                organization: organizationId
            });


        if (!asset) {
            return res.status(404).send(
                "Asset not found"
            );
        }


        // ---------------------------------------------
        // Don't permanently delete
        // ---------------------------------------------

        asset.status = "RETIRED";

        asset.assignedTo = null;

        asset.assignedDate = null;


        await asset.save();


        return res.redirect(
            "/assets"
        );


    } catch (error) {

        console.error(
            "DELETE ASSET ERROR:",
            error
        );

        return res.status(500).send(
            "Unable to retire asset"
        );
    }
};