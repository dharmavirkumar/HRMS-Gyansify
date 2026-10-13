"use strict";

// =====================================================
// GYANSIFY HRMS
// CENTRAL AUTHENTICATION & AUTHORIZATION MIDDLEWARE
// File: middleware/accessMiddleware.js
// =====================================================

const {
    hasPermission,
    getUserRole
} = require("./permissionMiddleware");


// =====================================================
// COMMON HELPERS
// =====================================================

const getSessionUser = (req) => {
    return req.session?.user || null;
};

const normalizeRole = (value) => {
    if (!value) return "";

    if (typeof value === "string") {
        return value.trim().toUpperCase();
    }

    if (typeof value === "object") {
        return normalizeRole(
            value.code ||
            value.roleCode ||
            value.name ||
            value.role
        );
    }

    return "";
};

const getRoleCodes = (req) => {
    const user = getSessionUser(req);

    if (!user) return [];

    const roles = [];

    // Single role fields
    if (user.role) roles.push(normalizeRole(user.role));
    if (user.roleCode) roles.push(normalizeRole(user.roleCode));

    // Multiple role fields
    if (Array.isArray(user.roles)) {
        user.roles.forEach((role) => {
            const normalized = normalizeRole(role);

            if (normalized) roles.push(normalized);
        });
    }

    // Include the role resolved by the existing permission module
    try {
        const resolvedRole = normalizeRole(getUserRole(req));

        if (resolvedRole) roles.push(resolvedRole);
    } catch (error) {
        // Session role fields remain available as a fallback.
    }

    return [...new Set(roles.filter(Boolean))];
};

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
    const user = getSessionUser(req);

    console.warn("[GYANSIFY HRMS] Access denied", {
        user: user?.email || "Unknown",
        roles: getRoleCodes(req),
        path: req.originalUrl,
        method: req.method,
        reason: message || "Insufficient permissions"
    });

    if (isHtmlRequest(req)) {
        return res.status(403).render("errors/403", {
            title: "Access Denied",
            user,
            message:
                message ||
                "You do not have permission to access this resource."
        });
    }

    return res.status(403).json({
        success: false,
        message:
            message ||
            "You do not have permission to access this resource."
    });
};


// =====================================================
// REQUIRE AUTHENTICATION
// =====================================================

const requireAuth = (req, res, next) => {
    try {
        const user = getSessionUser(req);

        if (!user) {
            return sendUnauthorized(req, res);
        }

        // Reject an explicitly inactive/locked session.
        // Missing status remains compatible with older sessions.
        if (user.status) {
            const status = String(user.status).trim().toUpperCase();

            if (!["ACTIVE"].includes(status)) {
                return req.session.destroy((error) => {
                    if (error) return next(error);

                    res.clearCookie("connect.sid");
                    return sendUnauthorized(req, res);
                });
            }
        }

        // Make authenticated session user available to controllers.
        req.user = user;

        return next();
    } catch (error) {
        return next(error);
    }
};


// =====================================================
// REQUIRE ONE OR MORE ALLOWED ROLES
//
// Usage:
// requireRole("SUPER_ADMIN", "HR_ADMIN")
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
            const user = getSessionUser(req);

            if (!user) {
                return sendUnauthorized(req, res);
            }

            req.user = user;

            // Fail closed if the middleware is misconfigured.
            if (allowed.size === 0) {
                return next(
                    new Error(
                        "Role middleware configuration error: no roles supplied."
                    )
                );
            }

            const userRoles = getRoleCodes(req);

            const authorized = userRoles.some((role) =>
                allowed.has(role)
            );

            if (!authorized) {
                return denyAccess(
                    req,
                    res,
                    "Your role is not allowed to access this resource."
                );
            }

            return next();
        } catch (error) {
            return next(error);
        }
    };
};


// =====================================================
// REQUIRE ONE PERMISSION
//
// Usage:
// requirePermission("employee.read")
// =====================================================

const requirePermission = (permission) => {
    return (req, res, next) => {
        try {
            const user = getSessionUser(req);

            if (!user) {
                return sendUnauthorized(req, res);
            }

            req.user = user;

            if (
                typeof permission !== "string" ||
                !permission.trim()
            ) {
                return next(
                    new Error(
                        "Permission middleware configuration error."
                    )
                );
            }

            if (!hasPermission(req, permission.trim())) {
                return denyAccess(
                    req,
                    res,
                    `Missing required permission: ${permission}`
                );
            }

            return next();
        } catch (error) {
            return next(error);
        }
    };
};


// =====================================================
// REQUIRE ANY PERMISSION
//
// Usage:
// requireAnyPermission("reports.read", "reports.team.read")
// =====================================================

const requireAnyPermission = (...requiredPermissions) => {
    const permissions = requiredPermissions
        .flat()
        .filter(
            (permission) =>
                typeof permission === "string" &&
                permission.trim()
        )
        .map((permission) => permission.trim());

    return (req, res, next) => {
        try {
            const user = getSessionUser(req);

            if (!user) {
                return sendUnauthorized(req, res);
            }

            req.user = user;

            if (permissions.length === 0) {
                return next(
                    new Error(
                        "Any-permission middleware requires at least one permission."
                    )
                );
            }

            const authorized = permissions.some((permission) =>
                hasPermission(req, permission)
            );

            if (!authorized) {
                return denyAccess(
                    req,
                    res,
                    "You do not have any of the permissions required for this resource."
                );
            }

            return next();
        } catch (error) {
            return next(error);
        }
    };
};


// =====================================================
// REQUIRE ALL PERMISSIONS
//
// Usage:
// requireAllPermissions("employee.read", "reports.read")
// =====================================================

const requireAllPermissions = (...requiredPermissions) => {
    const permissions = requiredPermissions
        .flat()
        .filter(
            (permission) =>
                typeof permission === "string" &&
                permission.trim()
        )
        .map((permission) => permission.trim());

    return (req, res, next) => {
        try {
            const user = getSessionUser(req);

            if (!user) {
                return sendUnauthorized(req, res);
            }

            req.user = user;

            if (permissions.length === 0) {
                return next(
                    new Error(
                        "All-permissions middleware requires at least one permission."
                    )
                );
            }

            const authorized = permissions.every((permission) =>
                hasPermission(req, permission)
            );

            if (!authorized) {
                return denyAccess(
                    req,
                    res,
                    "You do not have all the permissions required for this resource."
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
// =====================================================

module.exports = {
    requireAuth,
    requireRole,
    requirePermission,
    requireAnyPermission,
    requireAllPermissions,
    denyAccess
};