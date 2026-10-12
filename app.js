
/**
 * Gyansify HRMS
 * Express + EJS + MongoDB + Mongoose
 * Production-ready session configuration for Render
 */

// =====================================================
// ENVIRONMENT
// =====================================================

require("dotenv").config();

// =====================================================
// CORE
// =====================================================

const express = require("express");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo");

// =====================================================
// DATABASE
// =====================================================

const connectDB = require("./config/db");

// =====================================================
// ROUTES
// =====================================================

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const organizationRoutes = require("./routes/organizationRoutes");
const documentRoutes = require("./routes/documentRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const leaveRoutes = require("./routes/leaveRoutes");
const leaveAdminRoutes = require("./routes/leaveAdminRoutes");
const payrollRoutes = require("./routes/payrollRoutes");
const assetRoutes = require("./routes/assetRoutes");
const trainingRoutes = require("./routes/trainingRoutes");
const performanceRoutes = require("./routes/performanceRoutes");
const recruitmentRoutes = require("./routes/recruitmentRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const reportsRoutes = require("./routes/reportsRoutes");

// =====================================================
// APP CONFIGURATION
// =====================================================

const app = express();

const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Trust Render's HTTPS reverse proxy.
if (IS_PRODUCTION) {
    app.set("trust proxy", 1);
}

// =====================================================
// VALIDATE ENVIRONMENT
// =====================================================

if (IS_PRODUCTION && !process.env.SESSION_SECRET) {
    throw new Error(
        "SESSION_SECRET must be configured in Render Environment."
    );
}

// Use the same MongoDB URI variable as config/db.js.
const MONGODB_URI =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI;

if (!MONGODB_URI) {
    throw new Error(
        "MONGODB_URI or MONGO_URI is missing from environment variables."
    );
}

// =====================================================
// VIEW ENGINE
// =====================================================

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// =====================================================
// REQUEST PARSING
// =====================================================

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);

// =====================================================
// STATIC FILES
// =====================================================

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

// =====================================================
// SESSION CONFIGURATION
// =====================================================

app.use(
    session({
        name: "gyansify.sid",

        secret:
            process.env.SESSION_SECRET ||
            "gyansify_local_development_secret",

        resave: false,

        saveUninitialized: false,

        rolling: true,

        store: MongoStore.create({
            mongoUrl: MONGODB_URI,
            collectionName: "sessions",
            ttl: 24 * 60 * 60
        }),

        cookie: {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: "lax",
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);

// =====================================================
// GLOBAL EJS LOCALS
// =====================================================

app.use((req, res, next) => {
    res.locals.user = req.session?.user || null;
    res.locals.req = req;
    res.locals.appName = "Gyansify HRMS";
    res.locals.currentYear = new Date().getFullYear();

    next();
});

// =====================================================
// HOME
// =====================================================

app.get("/", (req, res) => {
    res.render("index", {
        title: "Gyansify HRMS"
    });
});

// =====================================================
// AUTHENTICATION
// =====================================================

app.use("/", authRoutes);

// =====================================================
// DASHBOARD
// =====================================================

app.use("/dashboard", dashboardRoutes);

// =====================================================
// EMPLOYEES & DOCUMENTS
// =====================================================

app.use("/employees", employeeRoutes);
app.use("/employees", documentRoutes);

// =====================================================
// ORGANIZATION
// =====================================================

app.use("/organization", organizationRoutes);

// =====================================================
// ATTENDANCE
// =====================================================

app.use("/attendance", attendanceRoutes);

// =====================================================
// LEAVE
// =====================================================

app.use("/leave", leaveRoutes);
app.use("/leave/admin", leaveAdminRoutes);

// =====================================================
// PAYROLL
// =====================================================

app.use("/payroll", payrollRoutes);

// =====================================================
// ASSETS
// =====================================================

app.use("/assets", assetRoutes);

// =====================================================
// TRAINING
// =====================================================

app.use("/training", trainingRoutes);

// =====================================================
// PERFORMANCE
// =====================================================

app.use("/performance", performanceRoutes);

// =====================================================
// RECRUITMENT
// =====================================================

app.use("/recruitment", recruitmentRoutes);

// =====================================================
// SETTINGS
// =====================================================

app.use("/settings", settingsRoutes);

// =====================================================
// REPORTS
// =====================================================

app.use("/reports", reportsRoutes);

// =====================================================
// 404 HANDLER
// =====================================================

app.use((req, res) => {
    console.log(
        `404 - ${req.method} ${req.originalUrl}`
    );

    res.status(404).send(
        "Gyansify HRMS - Page Not Found"
    );
});

// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use((err, req, res, next) => {
    console.error("GYANSIFY HRMS SERVER ERROR:", err);

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).send(
        "Gyansify HRMS - Internal Server Error"
    );
});

// =====================================================
// START SERVER AFTER DATABASE CONNECTION
// =====================================================

async function startServer() {
    try {
        await connectDB();

        app.listen(PORT, () => {
            console.log("====================================");
            console.log("       GYANSIFY HRMS SERVER");
            console.log("====================================");
            console.log(`Port: ${PORT}`);
            console.log(
                `Environment: ${process.env.NODE_ENV || "development"}`
            );
            console.log("MongoDB connected; server started.");
            console.log("====================================");
        });
    } catch (error) {
        console.error(
            "Failed to start Gyansify HRMS:",
            error.message
        );

        process.exit(1);
    }
}

startServer();
