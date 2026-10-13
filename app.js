
"use strict";

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

const connectMongo = require("connect-mongo");
const MongoStore = connectMongo.default || connectMongo;

const connectDB = require("./config/db");

const app = express();

const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// =====================================================
// ENVIRONMENT VALIDATION
// =====================================================

const MONGODB_URI =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI;

if (!MONGODB_URI) {
    throw new Error(
        "MONGODB_URI or MONGO_URI is missing from environment variables."
    );
}

if (IS_PRODUCTION && !process.env.SESSION_SECRET) {
    throw new Error(
        "SESSION_SECRET must be configured in production."
    );
}

if (IS_PRODUCTION) {
    app.set("trust proxy", 1);
}

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
const onboardingRoutes = require("./routes/onboardingRoutes");

const officeLocationRoutes = require(
    "./routes/officeLocationRoutes"
);
// =====================================================
// VIEW ENGINE
// =====================================================

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// =====================================================
// REQUEST PARSING
// =====================================================

app.use(express.json({ limit: "1mb" }));

app.use(
    express.urlencoded({
        extended: true,
        limit: "1mb"
    })
);

// =====================================================
// STATIC FILES
// =====================================================

app.use(
    express.static(path.join(__dirname, "public"))
);

// =====================================================
// SESSION STORE
// Supports current and legacy connect-mongo APIs
// =====================================================

function createMongoSessionStore() {
    const options = {
        mongoUrl: MONGODB_URI,
        collectionName: "sessions",
        ttl: 24 * 60 * 60
    };

    if (typeof MongoStore.create === "function") {
        return MongoStore.create(options);
    }

    // Compatibility for older connect-mongo versions.
    if (typeof MongoStore === "function") {
        const LegacyMongoStore = MongoStore(session);
        return new LegacyMongoStore(options);
    }

    throw new Error(
        "Unsupported connect-mongo version. Check your installed package version."
    );
}

app.use(
    session({
        name: "gyansify.sid",

        secret:
            process.env.SESSION_SECRET ||
            "gyansify_local_development_secret_change_me",

        resave: false,
        saveUninitialized: false,
        rolling: true,

        store: createMongoSessionStore(),

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
// HEALTH CHECK
// =====================================================

app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        app: "Gyansify HRMS",
        status: "running"
    });
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
// EMPLOYEES
// =====================================================

app.use("/employees", employeeRoutes);

// =====================================================
// DOCUMENT MANAGEMENT
// IMPORTANT: dedicated /documents mount
// =====================================================

app.use("/documents", documentRoutes);

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
// ONBOARDING
// =====================================================

app.use("/onboarding", onboardingRoutes);



app.use("/organization", officeLocationRoutes);
// =====================================================
// 404 HANDLER
// Must remain after all routes
// =====================================================

app.use((req, res) => {
    console.warn(
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
    console.error(
        "GYANSIFY HRMS SERVER ERROR:",
        err
    );

    if (res.headersSent) {
        return next(err);
    }

    // Handle common Multer upload errors.
    if (err.name === "MulterError") {
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).send(
                "File is too large. Maximum allowed size is 10 MB."
            );
        }

        return res.status(400).send(
            "The uploaded file could not be processed."
        );
    }

    const status = Number(err.status || err.statusCode);

    if (status >= 400 && status < 500) {
        return res.status(status).send(
            err.message || "The request could not be processed."
        );
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
                `Environment: ${
                    process.env.NODE_ENV || "development"
                }`
            );
            console.log("MongoDB connected; server started.");
            console.log("Documents: /documents");
            console.log("Health check: /health");
            console.log("====================================");
        });
    } catch (error) {
        console.error(
            "Failed to start Gyansify HRMS:",
            error
        );

        process.exit(1);
    }
}

startServer();

module.exports = app;
