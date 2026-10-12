
require("dotenv").config();

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const Organization = require("../models/Organization");
const LeaveType = require("../models/LeaveType");

// =====================================================
// CONFIGURATION
// =====================================================

const ORGANIZATION_NAME = "Gyansify";

// =====================================================
// DEFAULT LEAVE TYPES
// =====================================================

const leaveTypes = [
    {
        name: "Casual Leave",
        code: "CL",
        description: "Leave for personal or casual requirements.",
        isPaid: true,
        annualLimit: 12,
        allowCarryForward: false,
        maxCarryForward: 0,
        allowHalfDay: true,
        requireDocument: false
    },
    {
        name: "Sick Leave",
        code: "SL",
        description: "Leave for illness or medical reasons.",
        isPaid: true,
        annualLimit: 12,
        allowCarryForward: false,
        maxCarryForward: 0,
        allowHalfDay: true,
        requireDocument: false
    },
    {
        name: "Earned Leave",
        code: "EL",
        description: "Earned or annual leave.",
        isPaid: true,
        annualLimit: 18,
        allowCarryForward: true,
        maxCarryForward: 30,
        allowHalfDay: true,
        requireDocument: false
    },
    {
        name: "Leave Without Pay",
        code: "LWP",
        description: "Unpaid leave.",
        isPaid: false,
        annualLimit: 0,
        allowCarryForward: false,
        maxCarryForward: 0,
        allowHalfDay: true,
        requireDocument: false
    }
];

// =====================================================
// SEED LEAVE TYPES
// =====================================================

async function seedLeaveTypes() {
    let exitCode = 0;

    try {
        await connectDB();

        const organization = await Organization.findOne({
            name: ORGANIZATION_NAME
        });

        if (!organization) {
            throw new Error(
                `${ORGANIZATION_NAME} organization not found.`
            );
        }

        let created = 0;
        let updated = 0;

        for (const leaveType of leaveTypes) {
            const filter = {
                organization: organization._id,
                code: leaveType.code
            };

            const existing = await LeaveType.findOne(filter)
                .select("_id")
                .lean();

            await LeaveType.updateOne(
                filter,
                {
                    $set: {
                        ...leaveType,
                        organization: organization._id,
                        status: "Active"
                    },
                    $setOnInsert: {
                        organization: organization._id,
                        code: leaveType.code
                    }
                },
                {
                    upsert: true,
                    runValidators: true
                }
            );

            if (existing) {
                updated++;
                console.log(`Updated: ${leaveType.name}`);
            } else {
                created++;
                console.log(`Created: ${leaveType.name}`);
            }
        }

        console.log("\n====================================");
        console.log("LEAVE TYPES SEEDED SUCCESSFULLY");
        console.log("====================================");
        console.log(`Organization: ${organization.name}`);
        console.log(`Created: ${created}`);
        console.log(`Updated: ${updated}`);
        console.log("====================================\n");
    } catch (error) {
        exitCode = 1;

        console.error(
            "Leave Type Seed Error:",
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

seedLeaveTypes();