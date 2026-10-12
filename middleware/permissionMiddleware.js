
"use strict";

// =====================================================
// GYANSIFY HRMS
// CENTRAL ROLE-BASED PERMISSION MIDDLEWARE
// =====================================================

// =====================================================
// ROLE PERMISSIONS
// =====================================================

const ROLE_PERMISSIONS = Object.freeze({

    SUPER_ADMIN: [
        "*"
    ],

    HR_ADMIN: [
        "dashboard.read",

        "employee.read",
        "employee.create",
        "employee.update",
        "employee.delete",

        "attendance.read",
        "attendance.manage",

        "leave.read",
        "leave.apply",
        "leave.approve",
        "leave.reject",

        "payroll.read",
        "payroll.manage",

        "recruitment.read",
        "recruitment.manage",

        "performance.read",
        "performance.manage",

        "training.read",
        "training.manage",

        "assets.read",
        "assets.manage",

        "reports.read",

        "helpdesk.read",
        "helpdesk.manage",

        "organization.read",
        "organization.update"
    ],

    HR_EXECUTIVE: [
        "dashboard.read",

        "employee.read",
        "employee.create",
        "employee.update",

        "attendance.read",
        "attendance.manage",

        "leave.read",
        "leave.apply",
        "leave.approve",
        "leave.reject",

        "recruitment.read",
        "recruitment.manage",

        "performance.read",

        "training.read",

        "assets.read",

        "reports.read",

        "helpdesk.read",
        "helpdesk.manage"
    ],

    MANAGER: [
        "dashboard.read",

        "employee.read",

        "attendance.read",
        "attendance.manage",

        "leave.read",
        "leave.approve",
        "leave.reject",

        "performance.read",
        "performance.manage",

        "training.read",

        "reports.read",

        "helpdesk.read"
    ],

    EMPLOYEE: [
        "dashboard.read",

        "employee.read",

        "attendance.read",
        "attendance.manage",

        "leave.read",
        "leave.apply",

        "performance.read",

        "training.read",

        "assets.read",

        "helpdesk.read"
    ]
});

// =====================================================
// HELPERS
// =====================================================

const getCurrentUser = (req) =>
    req.session?.user || null;

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

const normalizePermission = (permission) =>
    typeof permission === "string"
        ? permission.trim().toLowerCase()
        : "";

// =====================================================
// GET USER ROLES
// Supports:
// user.role = "HR_ADMIN"
// user.roles = [{ code: "HR_ADMIN" }]
// user.roles = ["HR_ADMIN", "MANAGER"]
// =====================================================

const getUserRoles = (req) => {
    const user = getCurrentUser(req);

    if (!user) return [];

    const roles = [];

    if (user.role) {
        roles.push(normalizeRole(user.role));
    }

    if (Array.isArray(user.roles)) {
        for (const item of user.roles) {
            const role = normalizeRole(item);

            if (role) {
                roles.push(role);
            }
        }
    }

    return [...new Set(roles.filter(Boolean))];
};

// =====================================================
// GET PRIMARY USER ROLE
// Backward-compatible helper
// =====================================================

const getUserRole = (req) => {
    const roles = getUserRoles(req);

    return roles[0] || "";
};

// =====================================================
// GET PERMISSIONS FOR A ROLE
// =====================================================

const getRolePermissions = (role) => {
    const normalizedRole = normalizeRole(role);

    return ROLE_PERMISSIONS[normalizedRole] || [];
};

// =====================================================
// GET ALL USER PERMISSIONS
// Multiple roles receive the combined permissions.
// =====================================================

const getUserPermissions = (req) => {
    const roles = getUserRoles(req);

    const permissions = new Set();

    for (const role of roles) {
        const rolePermissions =
            getRolePermissions(role);

        for (const permission of rolePermissions) {
            permissions.add(permission);
        }
    }

    return [...permissions];
};

// =====================================================
// CHECK SINGLE PERMISSION
// =====================================================

const hasPermission = (req, permission) => {
    const requiredPermission =
        normalizePermission(permission);

    if (!requiredPermission) {
        return false;
    }

    const permissions = getUserPermissions(req);

    if (permissions.includes("*")) {
        return true;
    }

    return permissions.includes(requiredPermission);
};

// =====================================================
// CHECK ACCOUNT STATUS
// =====================================================

const isAccountActive = (user) => {
    if (!user) return false;

    // Allow sessions without status for compatibility.
    // Authentication middleware should verify current
    // database status for production security.
    if (
        user.status === undefined ||
        user.status === null ||
        user.status === ""
    ) {
        return true;
    }

    return [
        "ACTIVE",
        "Active",
        "active"
    ].includes(user.status);
};

// =====================================================
// LOGIN GUARD
// =====================================================

const ensureAuthenticated = (req, res) => {
    const user = getCurrentUser(req);

    if (!user || !(user._id || user.id)) {
        res.redirect("/login");
        return false;
    }

    if (!isAccountActive(user)) {
        if (req.session) {
            req.session.destroy((error) => {
                if (error) {
                    console.error(
                        "Session destruction error:",
                        error
                    );
                }

                res.clearCookie("connect.sid");

                return res.redirect("/login");
            });
        } else {
            res.redirect("/login");
        }

        return false;
    }

    req.user = user;
    req.currentUser = user;

    return true;
};

// =====================================================
// FORBIDDEN RESPONSE
// =====================================================

const sendForbidden = (
    req,
    res,
    message = "You do not have permission to access this resource."
) => {
    const user = getCurrentUser(req);

    console.warn("Permission denied:", {
        email: user?.email || "unknown",
        roles: getUserRoles(req),
        path: req.originalUrl || req.path
    });

    // Render the shared error page if it exists.
    // Ensure views/errors/403.ejs is present.
    return res.status(403).render(
        "errors/403",
        {
            title: "Access Denied",
            user: user || {},
            message
        }
    );
};

// =====================================================
// REQUIRE SINGLE PERMISSION
// Example:
// requirePermission("employee.read")
// =====================================================

const requirePermission = (permission) => {
    const requiredPermission =
        normalizePermission(permission);

    if (!requiredPermission) {
        throw new Error(
            "requirePermission() requires a valid permission key."
        );
    }

    return (req, res, next) => {
        try {
            if (!ensureAuthenticated(req, res)) {
                return;
            }

            if (!hasPermission(req, requiredPermission)) {
                return sendForbidden(
                    req,
                    res,
                    `Missing required permission: ${requiredPermission}`
                );
            }

            return next();
        } catch (error) {
            console.error(
                "Require Permission Error:",
                error
            );

            return res.status(500).send(
                "An authorization error occurred."
            );
        }
    };
};

// =====================================================
// REQUIRE ANY PERMISSION
// At least one permission must be granted.
// =====================================================

const requireAnyPermission = (permissions = []) => {
    if (
        !Array.isArray(permissions) ||
        permissions.length === 0
    ) {
        throw new Error(
            "requireAnyPermission() requires a non-empty array."
        );
    }

    const requiredPermissions = permissions.map(
        normalizePermission
    );

    if (requiredPermissions.some((item) => !item)) {
        throw new Error(
            "requireAnyPermission() received an invalid permission key."
        );
    }

    return (req, res, next) => {
        try {
            if (!ensureAuthenticated(req, res)) {
                return;
            }

            const allowed = requiredPermissions.some(
                (permission) =>
                    hasPermission(req, permission)
            );

            if (!allowed) {
                return sendForbidden(
                    req,
                    res,
                    "You do not have any of the required permissions."
                );
            }

            return next();
        } catch (error) {
            console.error(
                "Require Any Permission Error:",
                error
            );

            return res.status(500).send(
                "An authorization error occurred."
            );
        }
    };
};

// =====================================================
// REQUIRE ALL PERMISSIONS
// Every permission must be granted.
// =====================================================

const requireAllPermissions = (permissions = []) => {
    if (
        !Array.isArray(permissions) ||
        permissions.length === 0
    ) {
        throw new Error(
            "requireAllPermissions() requires a non-empty array."
        );
    }

    const requiredPermissions = permissions.map(
        normalizePermission
    );

    if (requiredPermissions.some((item) => !item)) {
        throw new Error(
            "requireAllPermissions() received an invalid permission key."
        );
    }

    return (req, res, next) => {
        try {
            if (!ensureAuthenticated(req, res)) {
                return;
            }

            const allowed = requiredPermissions.every(
                (permission) =>
                    hasPermission(req, permission)
            );

            if (!allowed) {
                return sendForbidden(
                    req,
                    res,
                    "You do not have all the required permissions."
                );
            }

            return next();
        } catch (error) {
            console.error(
                "Require All Permissions Error:",
                error
            );

            return res.status(500).send(
                "An authorization error occurred."
            );
        }
    };
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    ROLE_PERMISSIONS,

    getCurrentUser,
    getUserRole,
    getUserRoles,
    getUserPermissions,
    getRolePermissions,

    hasPermission,
    isAccountActive,

    requirePermission,
    requireAnyPermission,
    requireAllPermissions
};
