
const bcrypt = require("bcryptjs");
const User = require("../models/User");

// =====================================================
// ROLE CONFIGURATION
// =====================================================

const ALLOWED_ROLES = [
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE",
    "MANAGER",
    "EMPLOYEE"
];

// =====================================================
// GET DASHBOARD PATH
// Dashboard route renders the appropriate EJS view.
// =====================================================

const getDashboardPath = (role) => {
    switch (role) {
        case "SUPER_ADMIN":
        case "HR_ADMIN":
        case "HR_EXECUTIVE":
        case "MANAGER":
        case "EMPLOYEE":
            return "/dashboard";

        default:
            return null;
    }
};

// =====================================================
// GET LOGIN PAGE
// URL: GET /login
// =====================================================

exports.getLogin = (req, res) => {
    try {
        if (req.session?.user) {
            return res.redirect("/dashboard");
        }

        return res.render("auth/login", {
            title: "Login",
            error: null
        });
    } catch (error) {
        console.error("LOGIN PAGE ERROR:", error);

        return res.status(500).send(
            "Unable to load login page."
        );
    }
};

// =====================================================
// LOGIN
// URL: POST /login
// =====================================================

exports.login = async (req, res) => {
    try {
        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();

        const password = String(req.body.password || "");

        // Validate input
        if (!email || !password) {
            return res.status(400).render("auth/login", {
                title: "Login",
                error: "Email and password are required."
            });
        }

        // Find user using the actual User schema
        const user = await User.findOne({ email })
            .select("+password");

        if (!user) {
            return res.status(401).render("auth/login", {
                title: "Login",
                error: "Invalid email or password."
            });
        }

        // Check account status
        if (user.status !== "ACTIVE") {
            return res.status(403).render("auth/login", {
                title: "Login",
                error: "Your account is not active. Please contact your administrator."
            });
        }

        // Check organization assignment
        if (!user.organization) {
            console.error(
                "LOGIN FAILED: Organization missing",
                user.email
            );

            return res.status(403).render("auth/login", {
                title: "Login",
                error: "Your account is not assigned to an organization. Please contact your administrator."
            });
        }

        // Check password
        if (!user.password) {
            return res.status(401).render("auth/login", {
                title: "Login",
                error: "Invalid email or password."
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).render("auth/login", {
                title: "Login",
                error: "Invalid email or password."
            });
        }

        // Validate role
        const role = String(user.role || "")
            .trim()
            .toUpperCase();

        if (!ALLOWED_ROLES.includes(role)) {
            console.error(
                "LOGIN FAILED: Invalid role",
                user.email,
                role
            );

            return res.status(403).render("auth/login", {
                title: "Login",
                error: "Your account has no valid role. Please contact your administrator."
            });
        }

        const dashboardPath = getDashboardPath(role);

        if (!dashboardPath) {
            return res.status(403).render("auth/login", {
                title: "Login",
                error: "You are not authorized to access the dashboard."
            });
        }

        // Regenerate session to help prevent session fixation
        req.session.regenerate((sessionError) => {
            if (sessionError) {
                console.error(
                    "SESSION REGENERATE ERROR:",
                    sessionError
                );

                return res.status(500).send(
                    "Unable to create login session."
                );
            }

            const organizationId =
                user.organization.toString();

            // Create authenticated session
            req.session.user = {
                _id: user._id.toString(),
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                role,

                // Keep both fields for compatibility
                organization: organizationId,
                organizationId,

                // Employee linked to this account, if any
                employee: user.employee
                    ? user.employee.toString()
                    : null
            };

            // Save session before redirecting
            req.session.save((saveError) => {
                if (saveError) {
                    console.error(
                        "SESSION SAVE ERROR:",
                        saveError
                    );

                    return res.status(500).send(
                        "Unable to save login session."
                    );
                }

                console.log("====================================");
                console.log("GYANSIFY HRMS LOGIN SUCCESS");
                console.log("User:", user.email);
                console.log("Role:", role);
                console.log("Organization ID:", organizationId);
                console.log(
                    "Employee ID:",
                    req.session.user.employee || "Not linked"
                );
                console.log("Dashboard:", dashboardPath);
                console.log("====================================");

                return res.redirect(dashboardPath);
            });
        });
    } catch (error) {
        console.error("GYANSIFY HRMS LOGIN ERROR:", error);

        return res.status(500).send(
            "Internal Server Error"
        );
    }
};

// =====================================================
// LOGOUT
// URL: POST /logout or GET /logout
// =====================================================

exports.logout = (req, res) => {
    if (!req.session) {
        return res.redirect("/login");
    }

    req.session.destroy((error) => {
        if (error) {
            console.error("LOGOUT ERROR:", error);

            return res.status(500).send(
                "Unable to logout."
            );
        }

        res.clearCookie("connect.sid", {
            path: "/"
        });

        return res.redirect("/login");
    });
};
