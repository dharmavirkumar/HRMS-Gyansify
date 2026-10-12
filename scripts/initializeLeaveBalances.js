
require("dotenv").config();

const connectDB = require("../config/db");
const mongoose = require("mongoose");

const Employee = require("../models/Employee");

const {
    createDefaultLeaveBalances
} = require("../services/leaveBalanceService");

// =====================================================
// INITIALIZE LEAVE BALANCES
// =====================================================

async function initialize() {
    let exitCode = 0;

    try {
        await connectDB();

        const year = new Date().getFullYear();

        const employees = await Employee.find({
            status: { $ne: "Exited" }
        })
            .select("_id organization organizationId status")
            .lean();

        console.log(`Found ${employees.length} employees.`);

        let initialized = 0;
        let skipped = 0;
        let failed = 0;

        for (const employee of employees) {
            const organizationId =
                employee.organization ||
                employee.organizationId;

            if (!organizationId) {
                skipped++;

                console.warn(
                    `Skipping employee ${employee._id}: organization missing.`
                );

                continue;
            }

            try {
                await createDefaultLeaveBalances(
                    organizationId,
                    employee._id,
                    year
                );

                initialized++;

                console.log(
                    `Leave balance initialized for employee ${employee._id}.`
                );
            } catch (error) {
                failed++;

                console.error(
                    `Failed for employee ${employee._id}:`,
                    error.message
                );
            }
        }

        console.log("\nLeave balance initialization summary:");
        console.log(`Year: ${year}`);
        console.log(`Initialized: ${initialized}`);
        console.log(`Skipped: ${skipped}`);
        console.log(`Failed: ${failed}`);

        if (failed > 0) {
            exitCode = 1;
        }
    } catch (error) {
        exitCode = 1;

        console.error(
            "Leave balance initialization failed:",
            error
        );
    } finally {
        try {
            if (mongoose.connection.readyState !== 0) {
                await mongoose.connection.close();
            }
        } catch (closeError) {
            exitCode = 1;
            console.error(
                "Database cleanup failed:",
                closeError.message
            );
        }

        process.exitCode = exitCode;
    }
}

initialize();