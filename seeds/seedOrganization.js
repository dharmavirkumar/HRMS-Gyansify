
require("dotenv").config();

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const Organization = require("../models/Organization");

// =====================================================
// CONFIGURATION
// =====================================================

const ORGANIZATION_NAME = "Gyansify";

// =====================================================
// SEED ORGANIZATION
// =====================================================

async function seedOrganization() {
    let exitCode = 0;

    try {
        await connectDB();

        // Find existing organization
        const existingOrganization = await Organization.findOne({
            name: ORGANIZATION_NAME
        });

        if (existingOrganization) {
            console.log("\n====================================");
            console.log("ORGANIZATION ALREADY EXISTS");
            console.log("====================================");
            console.log("Name:", existingOrganization.name);
            console.log(
                "Organization ID:",
                existingOrganization._id.toString()
            );
            console.log("====================================\n");

            return;
        }

        // Create organization
        const organization = await Organization.create({
            name: ORGANIZATION_NAME,
            legalName: "Gyansify Technologies",
            email: "admin@gyansify.com",
            phone: "",
            logo: "",
            website: "",
            address: "",
            city: "",
            state: "",
            country: "India",
            pincode: "",

            timezone: "Asia/Kolkata",
            currency: "INR",
            financialYearStartMonth: 4,

            workingDays: [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday"
            ],

            attendanceStartTime: "10:00",
            attendanceLateAfter: "10:15",
            attendanceEndTime: "18:00",
            minimumWorkingHours: 8,

            leaveApprovalRequired: true,
            status: "ACTIVE"
        });

        console.log("\n====================================");
        console.log("ORGANIZATION CREATED SUCCESSFULLY");
        console.log("====================================");
        console.log("Name:", organization.name);
        console.log("Legal Name:", organization.legalName);
        console.log("Organization ID:", organization._id.toString());
        console.log("Timezone:", organization.timezone);
        console.log("Currency:", organization.currency);
        console.log("====================================\n");
    } catch (error) {
        exitCode = 1;

        console.error(
            "Organization Seed Error:",
            error.message
        );
    } finally {
        try {
            if (mongoose.connection.readyState !== 0) {
                await mongoose.connection.close();
            }
        } catch (closeError) {
            exitCode = 1;

            console.error(
                "Database close error:",
                closeError.message
            );
        }

        process.exitCode = exitCode;
    }
}

seedOrganization();