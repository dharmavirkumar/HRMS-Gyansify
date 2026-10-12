
"use strict";

// =====================================================
// GYANSIFY HRMS
// DASHBOARD AUTHORIZATION MIDDLEWARE
// =====================================================

const {
    hasPermission
} = require("./permissionMiddleware");

// =====================================================
// CONSTANTS
// =====================================================

const ROLE_DASHBOARDS = [
    {
        role: "SUPER_ADMIN",
        path: "/dashboard/admin"
    },
    {
        role: "HR_ADMIN",
        path: "/dashboard/hr"
    },
    {
        role: "HR_EXECUTIVE",
        path: "/dashboard/hr"
    },
    {
        role: "MANAGER",
        path: "/dashboard/manager"
    },
    {
        role: "EMPLOYEE",
        path: "/dashboard/employee"
    }
];

const ACTIVE_STATUSES = [
    "ACTIVE",
    "Active",
    "active"
];

// =====================================================
// GET CURRENT USER
// =====================================================

const getCurrentUser = (req) => {
    return req.session?.user || null;
};

// =====================================================
// NORMALIZE ROLE
// Supports string roles and populated Role documents
// =====================================================

const normalizeRole = (role) => {
    if (role && typeof role === "object") {
        role =
            role.code ||
            role.name ||
            role.role ||
            "";
    }

    return String(role || "")
        .trim()
        .toUpperCase();
};

// =====================================================
// GET USER ROLES
// Supports role and roles array
// =====================================================

const getUserRoles = (user) => {
    if (!user) return [];

    const roles = [];

    if (user.role) {
        const role = normalizeRole(user.role);

        if (role) {
            roles.push(role);
        }
    }

    if (Array.isArray(user.roles)) {
        for (const item of user.roles) {
            const role = normalizeRole(item);

            if (role) {
                roles.push(role);
            }
        }
    }

    return [...new Set(roles)];
};

// =====================================================
// CHECK LOGIN STATUS
// =====================================================

const isLoggedIn = (req) => {
    const user = getCurrentUser(req);

    if (!user) return false;

    const userId = user._id || user.id;

    // Session must contain a usable user identifier.
    if (!userId) return false;

    return true;
};

// =====================================================
// CHECK ACCOUNT STATUS
// =====================================================

const isAccountActive = (user) => {
    if (!user) return false;

    // Support sessions that do not store status.
    // Database-backed status validation should also be
    // performed by the authentication/session layer.
    if (
        user.status === undefined ||
        user.status === null ||
        user.status === ""
    ) {
        return true;
    }

    return ACTIVE_STATUSES.includes(user.status);
};

// =====================================================
// UNAUTHORIZED RESPONSE
// =====================================================

const handleUnauthorized = (req, res) => {
    if (req.session) {
        return req.session.destroy((error) => {
            if (error) {
                console.error(
                    "Session destruction error:",
                    error
                );
            }

            res.clearCookie("connect.sid");

            return res.redirect("/login");
        });
    }

    return res.redirect("/login");
};

// =====================================================
// FORBIDDEN RESPONSE
// =====================================================

const handleForbidden = (req, res, message) => {
    const user = getCurrentUser(req);

    return res.status(403).render(
        "errors/403",
        {
            title: "Access Denied",
            user: user || {},
            message:
                message ||
                "You do not have permission to access this resource."
        }
    );
};

// =====================================================
// REQUIRE LOGIN
// =====================================================

const requireLogin = (req, res, next) => {
    try {
        const user = getCurrentUser(req);

        if (!user) {
            return res.redirect("/login");
        }

        const userId = user._id || user.id;

        if (!userId) {
            return handleUnauthorized(req, res);
        }

        if (!isAccountActive(user)) {
            return handleUnauthorized(req, res);
        }

        req.user = user;
        req.currentUser = user;

        return next();
    } catch (error) {
        console.error(
            "Dashboard Login Middleware Error:",
            error
        );

        return res.status(500).send(
            "An authentication error occurred."
        );
    }
};

// =====================================================
// REDIRECT USER TO ROLE DASHBOARD
// =====================================================

const redirectToRoleDashboard = (req, res) => {
    try {
        const user = getCurrentUser(req);

        if (!user) {
            return res.redirect("/login");
        }

        if (!isAccountActive(user)) {
            return handleUnauthorized(req, res);
        }

        const roles = getUserRoles(user);

        // First matching role has the highest priority.
        const destination = ROLE_DASHBOARDS.find(
            (item) => roles.includes(item.role)
        );

        if (!destination) {
            console.warn(
                "Unknown HRMS role:",
                user.email || "unknown",
                roles
            );

            return handleForbidden(
                req,
                res,
                "Your account does not have a valid HRMS role. Contact your administrator."
            );
        }

        return res.redirect(destination.path);
    } catch (error) {
        console.error(
            "Dashboard Redirect Error:",
            error
        );

        return res.status(500).send(
            "Unable to determine your dashboard."
        );
    }
};

// =====================================================
// REQUIRE SPECIFIC ROLE(S)
// Usage:
// requireRole("SUPER_ADMIN", "HR_ADMIN")
// =====================================================

const requireRole = (...allowedRoles) => {
    const normalizedAllowedRoles = allowedRoles
        .flat()
        .map(normalizeRole)
        .filter(Boolean);

    if (normalizedAllowedRoles.length === 0) {
        throw new Error(
            "requireRole() needs at least one valid role."
        );
    }

    return (req, res, next) => {
        try {
            const user = getCurrentUser(req);

            if (!user) {
                return res.redirect("/login");
            }

            if (!isAccountActive(user)) {
                return handleUnauthorized(req, res);
            }

            const userRoles = getUserRoles(user);

            const allowed = normalizedAllowedRoles.some(
                (role) => userRoles.includes(role)
            );

            if (!allowed) {
                console.warn(
                    "Role access denied:",
                    user.email || "unknown",
                    userRoles,
                    "Required:",
                    normalizedAllowedRoles
                );

                return handleForbidden(
                    req,
                    res,
                    "Your role cannot access this page."
                );
            }

            req.user = user;
            req.currentUser = user;

            return next();
        } catch (error) {
            console.error(
                "Role Authorization Error:",
                error
            );

            return res.status(500).send(
                "An authorization error occurred."
            );
        }
    };
};

// =====================================================
// REQUIRE ANY OF THE SPECIFIED ROLES
// Alias for readability.
// =====================================================

const requireAnyRole = (...roles) => {
    return requireRole(...roles);
};

// =====================================================
// REQUIRE PERMISSION
// Usage:
// requireDashboardPermission("employee.read")
// =====================================================

const requireDashboardPermission = (permission) => {
    if (
        typeof permission !== "string" ||
        !permission.trim()
    ) {
        throw new Error(
            "requireDashboardPermission() needs a permission key."
        );
    }

    const permissionKey = permission.trim();

    return (req, res, next) => {
        try {
            const user = getCurrentUser(req);

            if (!user) {
                return res.redirect("/login");
            }

            if (!isAccountActive(user)) {
                return handleUnauthorized(req, res);
            }

            req.user = user;
            req.currentUser = user;

            const permitted = hasPermission(
                req,
                permissionKey
            );

            if (!permitted) {
                console.warn(
                    "Dashboard permission denied:",
                    user.email || "unknown",
                    permissionKey
                );

                return handleForbidden(
                    req,
                    res,
                    "You do not have permission to access this resource."
                );
            }

            return next();
        } catch (error) {
            console.error(
                "Dashboard Permission Error:",
                error
            );

            return res.status(500).send(
                "An authorization error occurred."
            );
        }
    };
};

// =====================================================
// REQUIRE HR ACCESS
// =====================================================

const requireHR = requireRole(
    "SUPER_ADMIN",
    "HR_ADMIN",
    "HR_EXECUTIVE"
);

// =====================================================
// REQUIRE ADMIN ACCESS
// =====================================================

const requireAdmin = requireRole(
    "SUPER_ADMIN",
    "HR_ADMIN"
);

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    requireLogin,
    redirectToRoleDashboard,
    requireRole,
    requireAnyRole,
    requireDashboardPermission,
    requireHR,
    requireAdmin,
    getCurrentUser,
    getUserRoles,
    normalizeRole,
    isAccountActive
};
