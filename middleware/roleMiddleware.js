"use strict";

// =====================================================
// GYANSIFY HRMS
// ROLE-BASED AUTHENTICATION & DASHBOARD MIDDLEWARE
// File: middleware/roleMiddleware.js
// =====================================================


// =====================================================
// ROLE DASHBOARD CONFIGURATION
// =====================================================

const ROLE_DASHBOARDS = Object.freeze({
    SUPER_ADMIN: "/dashboard/admin",
    HR_ADMIN: "/dashboard/hr",
    HR_EXECUTIVE: "/dashboard/hr",
    MANAGER: "/dashboard/manager",
    EMPLOYEE: "/dashboard/employee"
});


// =====================================================
// NORMALIZE ROLE
// Supports strings and role objects.
// =====================================================

const normalizeRole = (role) => {
    if (typeof role === "string") {
        return role.trim().toUpperCase();
    }

    if (role && typeof role === "object") {
        return normalizeRole(
            role.code ||
            role.roleCode ||
            role.name ||
            role.role
        );
    }

    return "";
};


// =====================================================
// GET CURRENT USER
// =====================================================

const getCurrentUser = (req) => {
    return req.session?.user || null;
};


// =====================================================
// GET USER ROLES
//
// Supports:
// user.role = "HR_ADMIN"
// user.roleCode = "HR_ADMIN"
// user.roles = ["HR_ADMIN", "MANAGER"]
// user.roles = [{ code: "HR_ADMIN" }]
// =====================================================

const getUserRoles = (user) => {
    if (!user) {
        return [];
    }

    const roles = [];

    if (user.role) {
        roles.push(normalizeRole(user.role));
    }

    if (user.roleCode) {
        roles.push(normalizeRole(user.roleCode));
    }

    if (Array.isArray(user.roles)) {
        user.roles.forEach((role) => {
            const normalized = normalizeRole(role);

            if (normalized) {
                roles.push(normalized);
            }
        });
    }

    return [...new Set(roles.filter(Boolean))];
};


// =====================================================
// REQUEST HELPERS
// =====================================================

const isHtmlRequest = (req) => {
    return Boolean(req.accepts("html"));
};


const sendUnauthorized = (req, res) => {
    if (isHtmlRequest(req)) {
        return res.redirect("/login");
    }

    return res.status(401).json({
        success: false,
        message: "Authentication required. Please log in."
    });
};


// =====================================================
// ACCESS DENIED
// =====================================================

const denyAccess = (req, res, message) => {
    console.warn("[GYANSIFY HRMS] Access denied:", {
        email: getCurrentUser(req)?.email || "Unknown",
        roles: getUserRoles(getCurrentUser(req)),
        path: req.originalUrl,
        method: req.method,
        reason: message
    });

    if (isHtmlRequest(req)) {
        return res.status(403).render("errors/403", {
            title: "Access Denied",
            user: getCurrentUser(req),
            message
        });
    }

    return res.status(403).json({
        success: false,
        message
    });
};


// =====================================================
// REQUIRE LOGIN
//
// Usage:
// router.get("/protected", requireLogin, controller);
// =====================================================

const requireLogin = (req, res, next) => {
    try {
        const user = getCurrentUser(req);

        if (!user) {
            return sendUnauthorized(req, res);
        }

        // Preserve existing controller compatibility.
        req.currentUser = user;
        req.user = user;

        return next();
    } catch (error) {
        return next(error);
    }
};


// =====================================================
// REDIRECT TO ROLE-BASED DASHBOARD
//
// Usage:
// router.get("/dashboard", redirectToRoleDashboard);
// =====================================================

const redirectToRoleDashboard = (req, res) => {
    try {
        const user = getCurrentUser(req);

        if (!user) {
            return sendUnauthorized(req, res);
        }

        const roles = getUserRoles(user);

        req.currentUser = user;
        req.user = user;

        // Explicit priority for users with multiple roles.
        const rolePriority = [
            "SUPER_ADMIN",
            "HR_ADMIN",
            "HR_EXECUTIVE",
            "MANAGER",
            "EMPLOYEE"
        ];

        const matchedRole = rolePriority.find((role) =>
            roles.includes(role)
        );

        if (matchedRole) {
            return res.redirect(ROLE_DASHBOARDS[matchedRole]);
        }

        console.error("[GYANSIFY HRMS] Unknown user role:", {
            email: user.email || "Unknown",
            roles
        });

        return denyAccess(
            req,
            res,
            "Your account does not have a valid HRMS role. Please contact your administrator."
        );
    } catch (error) {
        return nextDashboardError(error, res);
    }
};


// =====================================================
// HANDLE DASHBOARD ERRORS
// =====================================================

const nextDashboardError = (error, res) => {
    console.error("[GYANSIFY HRMS] Dashboard middleware error:", error);

    if (res.headersSent) {
        return;
    }

    return res.status(500).send(
        "An unexpected dashboard error occurred."
    );
};


// =====================================================
// REQUIRE SPECIFIC ROLE(S)
//
// Usage:
// requireRole("SUPER_ADMIN", "HR_ADMIN")
//
// Access is granted if the user has ANY allowed role.
// =====================================================

const requireRole = (...allowedRoles) => {
    const allowed = new Set(
        allowedRoles
            .flat()
            .map(normalizeRole)
            .filter(Boolean)
    );

    return (req, res, next) => {
        try {
            const user = getCurrentUser(req);

            if (!user) {
                return sendUnauthorized(req, res);
            }

            req.currentUser = user;
            req.user = user;

            if (allowed.size === 0) {
                return next(
                    new Error(
                        "Role middleware configuration error: no allowed roles supplied."
                    )
                );
            }

            const userRoles = getUserRoles(user);

            const hasAccess = userRoles.some((role) =>
                allowed.has(role)
            );

            if (!hasAccess) {
                return denyAccess(
                    req,
                    res,
                    "Access denied. You do not have permission to access this page."
                );
            }

            return next();
        } catch (error) {
            return next(error);
        }
    };
};


// =====================================================
// EXPORTS
// Preserve existing import names.
// =====================================================

module.exports = {
    requireLogin,
    redirectToRoleDashboard,
    requireRole,
    getCurrentUser,
    getUserRoles
};