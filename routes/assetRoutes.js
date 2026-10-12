const express = require("express");

const router = express.Router();

const {
    requireAuth
} = require("../middleware/authMiddleware");

const assetController = require("../controllers/assetController");


// =====================================================
// ASSET ROUTES
// =====================================================


// =====================================================
// ASSET DASHBOARD
// GET /assets
// =====================================================

router.get(
    "/",
    requireAuth,
    assetController.getAssets
);


// =====================================================
// CREATE ASSET
// =====================================================

// GET /assets/create

router.get(
    "/create",
    requireAuth,
    assetController.getCreateAsset
);


// POST /assets/create

router.post(
    "/create",
    requireAuth,
    assetController.createAsset
);


// =====================================================
// EDIT ASSET
// =====================================================

// GET /assets/:id/edit

router.get(
    "/:id/edit",
    requireAuth,
    assetController.getEditAsset
);


// POST /assets/:id/edit

router.post(
    "/:id/edit",
    requireAuth,
    assetController.updateAsset
);


// =====================================================
// VIEW ASSET
// GET /assets/:id
// =====================================================

router.get(
    "/:id",
    requireAuth,
    assetController.getAsset
);


// =====================================================
// DELETE / RETIRE ASSET
// POST /assets/:id/delete
// =====================================================

router.post(
    "/:id/delete",
    requireAuth,
    assetController.deleteAsset
);


module.exports = router;