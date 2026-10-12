const express = require("express");

const router =
    express.Router();

const documentController =
    require("../controllers/documentController");

const upload =
    require("../config/upload");


// =====================================================
// DOCUMENT PAGE
// =====================================================

router.get(
    "/:employeeId/documents",
    documentController.getDocuments
);


// =====================================================
// UPLOAD
// =====================================================

router.post(
    "/:employeeId/documents/upload",

    upload.single("document"),

    documentController.uploadDocument
);


// =====================================================
// DELETE
// =====================================================

router.post(
    "/:employeeId/documents/:documentId/delete",

    documentController.deleteDocument
);


module.exports = router;