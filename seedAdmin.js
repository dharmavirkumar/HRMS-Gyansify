// =====================================================
// ENVIRONMENT
// =====================================================

const dotenv = require("dotenv");

dotenv.config();


// =====================================================
// DATABASE
// =====================================================

const mongoose = require("mongoose");


// =====================================================
// PASSWORD
// =====================================================

const bcrypt = require("bcryptjs");


// =====================================================
// MODELS
// =====================================================

const User =
    require("./models/User");

const Organization =
    require("./models/Organization");


// =====================================================
// ADMIN DETAILS
// =====================================================

const ADMIN_NAME =
    "Gyansify Admin";

const ADMIN_EMAIL =
    "admin@gyansify.com";

const ADMIN_PASSWORD =
    "Admin@12345";


// =====================================================
// DATABASE CONNECTION
// =====================================================

const MONGO_URI =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI;


if (!MONGO_URI) {

    console.error(
        "MongoDB connection string not found in .env"
    );

    process.exit(1);

}


// =====================================================
// CREATE ADMIN
// =====================================================

const createAdmin = async () => {

    try {

        console.log(
            "===================================="
        );

        console.log(
            "CONNECTING TO MONGODB..."
        );

        console.log(
            "===================================="
        );


        await mongoose.connect(
            MONGO_URI
        );


        console.log(
            "MongoDB Connected"
        );


        // =================================================
        // FIND ORGANIZATION
        // =================================================

        let organization =
            await Organization.findOne({
                name: "Gyansify"
            });


        if (!organization) {

            organization =
                await Organization.findOne({
                    email: "admin@gyansify.com"
                });

        }


        if (!organization) {

            console.error(
                "===================================="
            );

            console.error(
                "GYANSIFY ORGANIZATION NOT FOUND"
            );

            console.error(
                "Please create the organization first."
            );

            console.error(
                "===================================="
            );

            await mongoose.disconnect();

            process.exit(1);

        }


        console.log(
            "Organization Found:"
        );

        console.log(
            organization.name
        );

        console.log(
            "Organization ID:"
        );

        console.log(
            organization._id.toString()
        );


        // =================================================
        // CHECK EXISTING ADMIN
        // =================================================

        let user =
            await User.findOne({
                email: ADMIN_EMAIL
            });


        // =================================================
        // PASSWORD HASH
        // =================================================

        const passwordHash =
            await bcrypt.hash(
                ADMIN_PASSWORD,
                12
            );


        // =================================================
        // CREATE ADMIN
        // =================================================

        if (!user) {

            user =
                await User.create({

                    name:
                        ADMIN_NAME,

                    email:
                        ADMIN_EMAIL,

                    password:
                        passwordHash,

                    organization:
                        organization._id,

                    role:
                        "SUPER_ADMIN",

                    status:
                        "ACTIVE"

                });


            console.log(
                "===================================="
            );

            console.log(
                "ADMIN CREATED SUCCESSFULLY"
            );

            console.log(
                "===================================="
            );

        }


        // =================================================
        // UPDATE EXISTING ADMIN
        // =================================================

        else {

            user.name =
                ADMIN_NAME;

            user.organization =
                organization._id;

            user.role =
                "SUPER_ADMIN";

            user.status =
                "ACTIVE";

            user.password =
                passwordHash;


            await user.save();


            console.log(
                "===================================="
            );

            console.log(
                "EXISTING ADMIN UPDATED"
            );

            console.log(
                "===================================="
            );

        }


        // =================================================
        // LOGIN DETAILS
        // =================================================

        console.log(
            ""
        );

        console.log(
            "===================================="
        );

        console.log(
            "       GYANSIFY ADMIN LOGIN"
        );

        console.log(
            "===================================="
        );

        console.log(
            "Email:"
        );

        console.log(
            ADMIN_EMAIL
        );

        console.log(
            "Password:"
        );

        console.log(
            ADMIN_PASSWORD
        );

        console.log(
            "Role:"
        );

        console.log(
            user.role
        );

        console.log(
            "Organization:"
        );

        console.log(
            organization.name
        );

        console.log(
            "Organization ID:"
        );

        console.log(
            organization._id.toString()
        );

        console.log(
            "===================================="
        );


        // =================================================
        // DISCONNECT
        // =================================================

        await mongoose.disconnect();

        console.log(
            "MongoDB Disconnected"
        );


        process.exit(0);

    } catch (error) {

        console.error(
            "===================================="
        );

        console.error(
            "ADMIN SEED ERROR"
        );

        console.error(
            "===================================="
        );

        console.error(error);


        try {

            await mongoose.disconnect();

        } catch (disconnectError) {

            console.error(
                disconnectError
            );

        }


        process.exit(1);

    }

};


// =====================================================
// RUN
// =====================================================

createAdmin();