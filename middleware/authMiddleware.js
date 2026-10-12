
"use strict";

// =====================================================
// GYANSIFY HRMS
// AUTHENTICATION & AUTHORIZATION MIDDLEWARE
// =====================================================

const {
    hasPermission,
    getUserRole
} = require("./permissionMiddleware");


// =====================================================
// COMMON: GET SESSION USER
// =====================================================

const getSessionUser = (req) => {
    return req.session?.user || null;
};


// =====================================================
// COMMON: ACCESS DENIED
// =====================================================

const denyAccess = (req, res, message = "You do not have permission to access this resource.") => {
    const user = getSessionUser(req);

    console.warn("====================================");
    console.warn("GYANSIFY HRMS - ACCESS DENIED");
    console.warn("User:", user?.email || "Unknown");
    console.warn("Role:", getUserRole(req) || "Unknown");
    console.warn("Path:", req.originalUrl);
    console.warn("Reason:", message);
    console.warn("====================================");

    if (req.accepts("html")) {
        return res.status(403).render("errors/403", {
            title: "Access Denied",
            user,
            message
        });
    }

    return res.status(403).json({
        success: false,
        message: "Access denied."
    });
};


// =====================================================
// REQUIRE AUTHENTICATION
// =====================================================

const requireAuth = (req, res, next) => {
    try {
        const user = getSessionUser(req);

        if (!user) {
            if (req.accepts("html")) {
                return res.redirect("/login");
            }

            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        // Make authenticated user available to controllers.
        req.user = user;

        next();
    } catch (error) {
        console.error("Authentication Middleware Error:", error);

        return res.status(500).send(
            "An authentication error occurred."
        );
    }
};


// =====================================================
// REQUIRE SPECIFIC ROLE(S)
// Example:
// requireRole("SUPER_ADMIN", "HR_ADMIN")
// =====================================================

const requireRole = (...allowedRoles) => {
    const roles = allowedRoles
        .flat()
        .filter(Boolean)
        .map(role => String(role).toUpperCase().trim());

    return (req, res, next) => {
        try {
            const user = getSessionUser(req);

            if (!user) {
                if (req.accepts("html")) {
                    return res.redirect("/login");
                }

                return res.status(401).json({
                    success: false,
                    message: "Authentication required."
                });
            }

            req.user = user;

            const userRole = getUserRole(req);

            if (!roles.includes(userRole)) {
                return denyAccess(
                    req,
                    res,
                    "Your role is not allowed to access this resource."
                );
            }

            next();
        } catch (error) {
            console.error("Role Middleware Error:", error);

            return res.status(500).send(
                "An authorization error occurred."
            );
        }
    };
};


// =====================================================
// REQUIRE ONE PERMISSION
// Example:
// requirePermission("employee.read")
// =====================================================

const requirePermission = (permission) => {
    return (req, res, next) => {
        try {
            const user = getSessionUser(req);

            if (!user) {
                if (req.accepts("html")) {
                    return res.redirect("/login");
                }

                return res.status(401).json({
                    success: false,
                    message: "Authentication required."
                });
            }

            req.user = user;

            if (!hasPermission(req, permission)) {
                return denyAccess(
                    req,
                    res,
                    `Missing required permission: ${permission}`
                );
            }

            next();
        } catch (error) {
            console.error("Permission Middleware Error:", error);

            return res.status(500).send(
                "An authorization error occurred."
            );
        }
    };
};


// =====================================================
// REQUIRE ANY PERMISSION
// Example:
// requireAnyPermission("reports.read", "reports.team.read")
// =====================================================

const requireAnyPermission = (...requiredPermissions) => {
    const permissions = requiredPermissions.flat();

    return (req, res, next) => {
        try {
            const user = getSessionUser(req);

            if (!user) {
                if (req.accepts("html")) {
                    return res.redirect("/login");
                }

                return res.status(401).json({
                    success: false,
                    message: "Authentication required."
                });
            }

            req.user = user;

            const allowed = permissions.some(permission =>
                hasPermission(req, permission)
            );

            if (!allowed) {
                return denyAccess(req, res);
            }

            next();
        } catch (error) {
            console.error("Permission Middleware Error:", error);

            return res.status(500).send(
                "An authorization error occurred."
            );
        }
    };
};


// =====================================================
// REQUIRE ALL PERMISSIONS
// Example:
// requireAllPermissions("employee.read", "reports.read")
// =====================================================

const requireAllPermissions = (...requiredPermissions) => {
    const permissions = requiredPermissions.flat();

    return (req, res, next) => {
        try {
            const user = getSessionUser(req);

            if (!user) {
                if (req.accepts("html")) {
                    return res.redirect("/login");
                }

                return res.status(401).json({
                    success: false,
                    message: "Authentication required."
                });
            }

            req.user = user;

            const allowed = permissions.every(permission =>
                hasPermission(req, permission)
            );

            if (!allowed) {
                return denyAccess(req, res);
            }

            next();
        } catch (error) {
            console.error("Permission Middleware Error:", error);

            return res.status(500).send(
                "An authorization error occurred."
            );
        }
    };
};


// =====================================================
// EXPORT MIDDLEWARE
// =====================================================

module.exports = {
    requireAuth,
    requireRole,
    requirePermission,
    requireAnyPermission,
    requireAllPermissions
};