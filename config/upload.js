const multer = require("multer");
const path = require("path");
const fs = require("fs");


const uploadDirectory =
    path.join(
        __dirname,
        "..",
        "public",
        "uploads",
        "employees"
    );


if (
    !fs.existsSync(uploadDirectory)
) {

    fs.mkdirSync(
        uploadDirectory,
        {
            recursive: true
        }
    );

}


const storage =
    multer.diskStorage({

        destination:
            (req, file, cb) => {

                cb(
                    null,
                    uploadDirectory
                );

            },

        filename:
            (req, file, cb) => {

                const extension =
                    path.extname(
                        file.originalname
                    );

                const name =
                    path.basename(
                        file.originalname,
                        extension
                    )
                    .replace(
                        /[^a-zA-Z0-9]/g,
                        "-"
                    );

                const uniqueName =
                    `${Date.now()}-${name}${extension}`;


                cb(
                    null,
                    uniqueName
                );

            }

    });


const fileFilter =
    (req, file, cb) => {

        const allowedTypes = [

            "application/pdf",

            "image/jpeg",

            "image/png",

            "image/jpg"

        ];


        if (
            allowedTypes.includes(
                file.mimetype
            )
        ) {

            cb(
                null,
                true
            );

        } else {

            cb(
                new Error(
                    "Only PDF, JPG and PNG files are allowed."
                )
            );

        }

    };


const upload =
    multer({

        storage,

        fileFilter,

        limits: {

            fileSize:
                5 * 1024 * 1024

        }

    });


module.exports = upload;