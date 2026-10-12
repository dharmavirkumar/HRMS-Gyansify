// =====================================================
// GYANSIFY HRMS
// ROLE BASED DASHBOARD MIDDLEWARE
// =====================================================


// =====================================================
// GET CURRENT USER
// =====================================================

const getCurrentUser = (req) => {

    return req.session?.user || null;

};


// =====================================================
// GET USER ROLES
// Supports:
//
// user.role
//
// OR
//
// user.roles = [
//     "HR_ADMIN"
// ]
//
// OR
//
// user.roles = [
//     { code: "HR_ADMIN" }
// ]
// =====================================================

const getUserRoles = (user) => {

    if (!user) {
        return [];
    }


    // =================================================
    // SINGLE ROLE
    // =================================================

    if (user.role) {

        return [
            String(user.role)
                .trim()
                .toUpperCase()
        ];

    }


    // =================================================
    // MULTIPLE ROLES
    // =================================================

    if (Array.isArray(user.roles)) {

        return user.roles
            .map((role) => {

                if (
                    typeof role === "object" &&
                    role !== null
                ) {

                    return String(
                        role.code ||
                        role.name ||
                        ""
                    )
                        .trim()
                        .toUpperCase();

                }


                return String(role)
                    .trim()
                    .toUpperCase();

            })
            .filter(Boolean);

    }


    return [];

};


// =====================================================
// REQUIRE LOGIN
// =====================================================

exports.requireLogin = (
    req,
    res,
    next
) => {

    const user =
        getCurrentUser(req);


    if (!user) {

        return res.redirect(
            "/login"
        );

    }


    req.currentUser =
        user;


    next();

};


// =====================================================
// REDIRECT USER TO ROLE DASHBOARD
// =====================================================

exports.redirectToRoleDashboard = (
    req,
    res
) => {

    const user =
        getCurrentUser(req);


    // =================================================
    // LOGIN CHECK
    // =================================================

    if (!user) {

        return res.redirect(
            "/login"
        );

    }


    // =================================================
    // GET USER ROLES
    // =================================================

    const roles =
        getUserRoles(user);


    // =================================================
    // SUPER ADMIN
    // =================================================

    if (
        roles.includes(
            "SUPER_ADMIN"
        )
    ) {

        return res.redirect(
            "/dashboard/admin"
        );

    }


    // =================================================
    // HR ADMIN
    // =================================================

    if (
        roles.includes(
            "HR_ADMIN"
        )
    ) {

        return res.redirect(
            "/dashboard/hr"
        );

    }


    // =================================================
    // HR EXECUTIVE
    // =================================================

    if (
        roles.includes(
            "HR_EXECUTIVE"
        )
    ) {

        return res.redirect(
            "/dashboard/hr"
        );

    }


    // =================================================
    // MANAGER
    // =================================================

    if (
        roles.includes(
            "MANAGER"
        )
    ) {

        return res.redirect(
            "/dashboard/manager"
        );

    }


    // =================================================
    // EMPLOYEE
    // =================================================

    if (
        roles.includes(
            "EMPLOYEE"
        )
    ) {

        return res.redirect(
            "/dashboard/employee"
        );

    }


    // =================================================
    // UNKNOWN ROLE
    // =================================================

    console.error(
        "Unknown user role:",
        roles
    );


    return res.status(403).send(
        "Your account does not have a valid HRMS role."
    );

};


// =====================================================
// REQUIRE SPECIFIC ROLE
// =====================================================

exports.requireRole = (
    ...allowedRoles
) => {

    return (
        req,
        res,
        next
    ) => {

        const user =
            getCurrentUser(req);


        // =================================================
        // LOGIN CHECK
        // =================================================

        if (!user) {

            return res.redirect(
                "/login"
            );

        }


        // =================================================
        // GET USER ROLES
        // =================================================

        const userRoles =
            getUserRoles(user);


        // =================================================
        // NORMALIZE ALLOWED ROLES
        // =================================================

        const roles =
            allowedRoles
                .map((role) => {

                    return String(role)
                        .trim()
                        .toUpperCase();

                })
                .filter(Boolean);


        // =================================================
        // CHECK ACCESS
        // =================================================

        const hasAccess =
            roles.some(
                (role) =>
                    userRoles.includes(role)
            );


        // =================================================
        // ACCESS DENIED
        // =================================================

        if (!hasAccess) {

            return res.status(403).send(
                "Access denied. You do not have permission to access this page."
            );

        }


        // =================================================
        // ATTACH USER
        // =================================================

        req.currentUser =
            user;


        next();

    };

};


// =====================================================
// EXPORT HELPERS
// =====================================================

exports.getCurrentUser =
    getCurrentUser;


exports.getUserRoles =
    getUserRoles;