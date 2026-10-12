
require("dotenv").config();

const mongoose = require("mongoose");

const connectDB = require("../config/db");

const Organization = require("../models/Organization");
const Employee = require("../models/Employee");
const LeaveType = require("../models/LeaveType");
const LeaveBalance = require("../models/LeaveBalance");

// =====================================================
// CONFIGURATION
// =====================================================

const CURRENT_YEAR = new Date().getFullYear();
const ORGANIZATION_NAME = "Gyansify";

// =====================================================
// SEED LEAVE BALANCES
// =====================================================

async function seedLeaveBalances() {
    let exitCode = 0;

    try {
        await connectDB();

        // Find organization
        const organization = await Organization.findOne({
            name: ORGANIZATION_NAME
        });

        if (!organization) {
            throw new Error(
                `${ORGANIZATION_NAME} organization not found.`
            );
        }

        // Fetch only employees belonging to this organization
        const employees = await Employee.find({
            organization: organization._id,
            status: { $ne: "Exited" }
        })
            .select("_id organization status")
            .lean();

        if (employees.length === 0) {
            console.log(
                `No eligible employees found for ${ORGANIZATION_NAME}.`
            );

            return;
        }

        // Fetch active leave types for this organization
        const leaveTypes = await LeaveType.find({
            organization: organization._id,
            status: "Active"
        })
            .select("_id annualLimit name")
            .lean();

        if (leaveTypes.length === 0) {
            throw new Error(
                "No active leave types found for this organization."
            );
        }

        let created = 0;
        let existing = 0;

        // Create missing employee/leave-type/year balances
        for (const employee of employees) {
            for (const leaveType of leaveTypes) {
                const filter = {
                    organization: organization._id,
                    employee: employee._id,
                    leaveType: leaveType._id,
                    year: CURRENT_YEAR
                };

                // Atomic upsert. Existing balances are not overwritten.
                const result = await LeaveBalance.updateOne(
                    filter,
                    {
                        $setOnInsert: {
                            ...filter,
                            allocated: leaveType.annualLimit || 0,
                            carriedForward: 0,
                            used: 0,
                            adjustment: 0,
                            status: "Active"
                        }
                    },
                    {
                        upsert: true
                    }
                );

                if (result.upsertedCount > 0) {
                    created++;
                } else {
                    existing++;
                }
            }
        }

        console.log("\n====================================");
        console.log("LEAVE BALANCE SEED COMPLETE");
        console.log("====================================");
        console.log(`Organization: ${organization.name}`);
        console.log(`Year: ${CURRENT_YEAR}`);
        console.log(`Employees: ${employees.length}`);
        console.log(`Active Leave Types: ${leaveTypes.length}`);
        console.log(`Balances Created: ${created}`);
        console.log(`Already Existing: ${existing}`);
        console.log("====================================\n");
    } catch (error) {
        exitCode = 1;

        console.error(
            "Leave Balance Seed Error:",
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

seedLeaveBalances();