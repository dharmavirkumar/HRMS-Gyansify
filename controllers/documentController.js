const path = require("path");
const fs = require("fs");

const Employee =
    require("../models/Employee");

const EmployeeDocument =
    require("../models/EmployeeDocument");


// =====================================================
// DOCUMENT PAGE
// =====================================================

exports.getDocuments = async (req, res) => {

    try {

        const employee =
            await Employee.findById(
                req.params.employeeId
            )
            .populate(
                "department",
                "name"
            )
            .populate(
                "designation",
                "name"
            );


        if (!employee) {

            return res.status(404).send(
                "Employee not found"
            );

        }


        const documents =
            await EmployeeDocument.find({
                employee:
                    employee._id,

                status: "Active"

            })
            .sort({
                createdAt: -1
            });


        res.render(
            "employees/documents",
            {
                title:
                    "Employee Documents",

                user:
                    req.session.user,

                employee,

                documents
            }
        );

    } catch (error) {

        console.error(error);

        res.status(500).send(
            "Unable to load documents"
        );

    }

};


// =====================================================
// UPLOAD DOCUMENT
// =====================================================

exports.uploadDocument =
    async (req, res) => {

        try {

            const employee =
                await Employee.findById(
                    req.params.employeeId
                );


            if (!employee) {

                return res.status(404).send(
                    "Employee not found"
                );

            }


            if (!req.file) {

                return res.status(400).send(
                    "Please select a file"
                );

            }


            const {

                documentType,

                documentName

            } = req.body;


            await EmployeeDocument.create({

                employee:
                    employee._id,

                documentType,

                documentName,

                fileName:
                    req.file.filename,

                filePath:
                    `/uploads/employees/${req.file.filename}`,

                mimeType:
                    req.file.mimetype,

                fileSize:
                    req.file.size

            });


            res.redirect(
                `/employees/${employee._id}/documents`
            );

        } catch (error) {

            console.error(error);

            res.status(500).send(
                "Unable to upload document"
            );

        }

    };


// =====================================================
// DELETE DOCUMENT
// =====================================================

exports.deleteDocument =
    async (req, res) => {

        try {

            const document =
                await EmployeeDocument.findById(
                    req.params.documentId
                );


            if (!document) {

                return res.status(404).send(
                    "Document not found"
                );

            }


            const filePath =
                path.join(
                    __dirname,
                    "..",
                    "public",
                    document.filePath
                );


            if (
                fs.existsSync(filePath)
            ) {

                fs.unlinkSync(
                    filePath
                );

            }


            await EmployeeDocument.findByIdAndDelete(
                document._id
            );


            res.redirect(
                `/employees/${document.employee}/documents`
            );

        } catch (error) {

            console.error(error);

            res.status(500).send(
                "Unable to delete document"
            );

        }

    };