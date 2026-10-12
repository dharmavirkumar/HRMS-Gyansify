// =====================================================
// ENVIRONMENT
// =====================================================

const dotenv = require("dotenv");

dotenv.config();


// =====================================================
// CORE
// =====================================================

const express = require("express");
const path = require("path");


// =====================================================
// EJS LAYOUT
// =====================================================

const expressLayouts = require("express-ejs-layouts");


// =====================================================
// DATABASE
// =====================================================

const connectDB = require("./config/db");


// =====================================================
// SESSION
// =====================================================

const session = require("express-session");


// =====================================================
// ROUTES
// =====================================================

const authRoutes =
    require("./routes/authRoutes");

const dashboardRoutes =
    require("./routes/dashboardRoutes");

const employeeRoutes =
    require("./routes/employeeRoutes");

const organizationRoutes =
    require("./routes/organizationRoutes");

const documentRoutes =
    require("./routes/documentRoutes");

const attendanceRoutes =
    require("./routes/attendanceRoutes");

const leaveRoutes =
    require("./routes/leaveRoutes");

const leaveAdminRoutes =
    require("./routes/leaveAdminRoutes");

const payrollRoutes =
    require("./routes/payrollRoutes");

const assetRoutes =
    require("./routes/assetRoutes");

const trainingRoutes =
    require("./routes/trainingRoutes");

const performanceRoutes =
    require("./routes/performanceRoutes");

const recruitmentRoutes =
    require("./routes/recruitmentRoutes");


const settingsRoutes =
    require("./routes/settingsRoutes");

const reportsRoutes =
    require("./routes/reportsRoutes");




// =====================================================
// APP
// =====================================================

const app = express();


// =====================================================
// DATABASE
// =====================================================

connectDB();


// =====================================================
// VIEW ENGINE
// =====================================================

app.set(
    "view engine",
    "ejs"
);

app.set(
    "views",
    path.join(__dirname, "views")
);


// =====================================================
// EJS LAYOUT
// =====================================================
//
// This enables:
//
// views/layout.ejs
//
// and:
//
// <%- body %>
//
// inside layout.ejs.
//

// app.use(expressLayouts);

// app.set(
//     "layout",
//     "layouts/layout"
// );


// =====================================================
// BODY PARSER
// =====================================================

app.use(
    express.json()
);

app.use(
    express.urlencoded({
        extended: true
    })
);


// =====================================================
// STATIC FILES
// =====================================================
//
// Everything inside:
//
// public/
//
// will be available from:
//
// /
//
// Example:
//
// public/css/output.css
//       ↓
// /css/output.css
//

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// =====================================================
// SESSION
// =====================================================

app.use(
    session({

        secret:
            process.env.SESSION_SECRET ||
            "gyansify_hrms_secret_key",

        resave: false,

        saveUninitialized: false,

        cookie: {

            maxAge:
                1000 *
                60 *
                60 *
                24,

            httpOnly: true,

            secure:
                process.env.NODE_ENV === "production"

        }

    })
);


// =====================================================
// GLOBAL VIEW LOCALS
// =====================================================
//
// These variables are automatically available
// inside every EJS page.
//

app.use(
    (req, res, next) => {

        // Logged-in user
        res.locals.user =
            req.session?.user || null;


        // Current request
        res.locals.req =
            req;


        // Application name
        res.locals.appName =
            "Gyansify HRMS";


        // Current year
        res.locals.currentYear =
            new Date().getFullYear();


        next();

    }
);


// =====================================================
// HOME PAGE
// =====================================================

app.get(
    "/",
    (req, res) => {

        return res.render(
            "home/index",
            {
                title: "Gyansify HRMS"
            }
        );

    }
);


// =====================================================
// AUTHENTICATION
// =====================================================

app.use( "/", authRoutes );

// =====================================================
// DASHBOARD
// =====================================================

app.use(
    "/dashboard",
    dashboardRoutes
);


// =====================================================
// EMPLOYEES
// =====================================================

app.use(
    "/employees",
    employeeRoutes
);


// =====================================================
// EMPLOYEE DOCUMENTS
// =====================================================

app.use(
    "/employees",
    documentRoutes
);


// =====================================================
// ORGANIZATION
// =====================================================

app.use(
    "/organization",
    organizationRoutes
);


// =====================================================
// ATTENDANCE
// =====================================================

app.use(
    "/attendance",
    attendanceRoutes
);


// =====================================================
// LEAVE
// =====================================================

app.use(
    "/leave",
    leaveRoutes
);


// =====================================================
// LEAVE ADMIN
// =====================================================

app.use(
    "/leave/admin",
    leaveAdminRoutes
);


// =====================================================
// PAYROLL
// =====================================================

app.use(
    "/payroll",
    payrollRoutes
);


// =====================================================
// ASSETS
// =====================================================

app.use(
    "/assets",
    assetRoutes
);


// =====================================================
// TRAINING
// =====================================================

app.use(
    "/training",
    trainingRoutes
);



// =====================================================
// PERFORMANCE
// =====================================================

app.use(
    "/performance",
    performanceRoutes
);


// =====================================================
// RECRUITMENT
// =====================================================

app.use(
    "/recruitment",
    recruitmentRoutes
);


// =====================================================
// SETTINGS
// =====================================================

app.use(
    "/settings",
    settingsRoutes
);


// =====================================================
// REPORTS
// =====================================================

app.use(
    "/reports",
    reportsRoutes
);

// =====================================================
// 404
// =====================================================
//
// MUST ALWAYS BE LAST
//

app.use(
    (req, res) => {

        console.log(
            `404 - ${req.method} ${req.originalUrl}`
        );

        return res.status(404).send(
            "Gyansify HRMS - Page Not Found"
        );

    }
);


// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use(
    (err, req, res, next) => {

        console.error(
            "===================================="
        );

        console.error(
            "GYANSIFY HRMS SERVER ERROR"
        );

        console.error(
            "===================================="
        );

        console.error(err);


        // If headers are already sent,
        // let Express handle the error.
        if (res.headersSent) {
            return next(err);
        }


        return res.status(500).send(
            "Gyansify HRMS - Internal Server Error"
        );

    }
);


// =====================================================
// SERVER
// =====================================================

const PORT =
    process.env.PORT || 5000;


app.listen(
    PORT,
    () => {

        console.log(
            "===================================="
        );

        console.log(
            "       GYANSIFY HRMS SERVER"
        );

        console.log(
            "===================================="
        );

        console.log(
            `Server running at: http://localhost:${PORT}`
        );

        console.log(
            `Environment: ${
                process.env.NODE_ENV ||
                "development"
            }`
        );

        console.log(
            "===================================="
        );

    }
);