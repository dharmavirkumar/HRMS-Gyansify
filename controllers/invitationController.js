
"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

// =====================================================
// CONFIGURATION
// =====================================================

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const BCRYPT_ROUNDS = 12;

// =====================================================
// HELPERS
// =====================================================

function normalizeToken(token) {
    if (typeof token !== "string") {
        return "";
    }

    return token.trim().toLowerCase();
}

function isValidToken(token) {
    return (
        typeof token === "string" &&
        /^[a-f0-9]{64}$/.test(token)
    );
}

function hashToken(token) {
    return crypto
        .createHash("sha256")
        .update(normalizeToken(token))
        .digest("hex");
}

function renderPasswordPage(res, options = {}) {
    const {
        statusCode = 200,
        title = "Set Your Password",
        error = null,
        success = null,
        token = "",
        email = ""
    } = options;

    return res.status(statusCode).render("auth/set-password", {
        title,
        error,
        success,
        token,
        email,
        currentYear: new Date().getFullYear()
    });
}

// Find a valid, unused invitation.
async function findPendingInvitation(token) {
    return User.findOne({
        invitationTokenHash: hashToken(token),
        invitationExpiresAt: {
            $gt: new Date()
        },
        status: "INACTIVE"
    }).select("+invitationTokenHash");
}

// =====================================================
// GET /set-password
// GET /accept-invitation
// Display the password setup page.
// =====================================================


exports.getSetPassword = async (req, res, next) => {
    try {
        const token = normalizeToken(req.query?.token);

        console.log("INVITATION DEBUG:", {
            tokenPresent: Boolean(token),
            tokenLength: token.length,
            tokenFormatValid: isValidToken(token)
        });

        if (!isValidToken(token)) {
            return renderPasswordPage(res, {
                statusCode: 400,
                title: "Invalid Invitation",
                error: "This invitation link is invalid or incomplete."
            });
        }

        const hashedToken = hashToken(token);

        const user = await User.findOne({
            invitationTokenHash: hashedToken,
            invitationExpiresAt: { $gt: new Date() },
            status: "INACTIVE"
        }).select("+invitationTokenHash");

        console.log("INVITATION LOOKUP:", {
            userFound: Boolean(user),
            status: user?.status || null,
            expiry: user?.invitationExpiresAt || null
        });

        if (!user) {
            return renderPasswordPage(res, {
                statusCode: 400,
                title: "Invitation Expired",
                error:
                    "This invitation is invalid, expired, or has already been used. Please contact HR for a new invitation."
            });
        }

        return renderPasswordPage(res, {
            title: "Set Your Password",
            token,
            email: user.email
        });
    } catch (error) {
        console.error("Get Set Password Error:", error);
        return next(error);
    }
};


// =====================================================
// POST /set-password
// POST /accept-invitation
// Validate password and activate the account.
// =====================================================

exports.postSetPassword = async (req, res, next) => {
    try {
        const token = normalizeToken(req.body?.token);
        const password = req.body?.password;
        const confirmPassword = req.body?.confirmPassword;

        // -------------------------------------------------
        // 1. Validate invitation token
        // -------------------------------------------------

        if (!isValidToken(token)) {
            return renderPasswordPage(res, {
                statusCode: 400,
                title: "Invalid Invitation",
                error:
                    "Your invitation link is invalid. Please request a new invitation from HR."
            });
        }

        // -------------------------------------------------
        // 2. Verify invitation before processing password
        // -------------------------------------------------

        const user = await findPendingInvitation(token);

        if (!user) {
            return renderPasswordPage(res, {
                statusCode: 400,
                title: "Invitation Expired",
                error:
                    "This invitation has expired, is invalid, or has already been used. Please contact HR."
            });
        }

        // -------------------------------------------------
        // 3. Validate password
        // -------------------------------------------------

        if (
            typeof password !== "string" ||
            password.length < PASSWORD_MIN_LENGTH ||
            password.length > PASSWORD_MAX_LENGTH
        ) {
            return renderPasswordPage(res, {
                statusCode: 400,
                title: "Set Your Password",
                error:
                    `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
                token,
                email: user.email
            });
        }

        if (
            typeof confirmPassword !== "string" ||
            password !== confirmPassword
        ) {
            return renderPasswordPage(res, {
                statusCode: 400,
                title: "Set Your Password",
                error: "Passwords do not match.",
                token,
                email: user.email
            });
        }

        // -------------------------------------------------
        // 4. Hash the password
        // -------------------------------------------------

        const passwordHash = await bcrypt.hash(
            password,
            BCRYPT_ROUNDS
        );

        // -------------------------------------------------
        // 5. Activate account atomically
        //
        // The token must still be valid when the update runs.
        // A previously used invitation cannot activate twice.
        // -------------------------------------------------

        const result = await User.updateOne(
            {
                _id: user._id,
                invitationTokenHash: hashToken(token),
                invitationExpiresAt: {
                    $gt: new Date()
                },
                status: "INACTIVE"
            },
            {
                $set: {
                    password: passwordHash,
                    status: "ACTIVE"
                },
                $unset: {
                    invitationTokenHash: 1,
                    invitationExpiresAt: 1
                }
            },
            {
                runValidators: true
            }
        );

        const updatedCount =
            result.modifiedCount ?? result.nModified ?? 0;

        if (updatedCount !== 1) {
            return renderPasswordPage(res, {
                statusCode: 400,
                title: "Invitation Expired",
                error:
                    "This invitation has expired or has already been used. Please request a new invitation from HR."
            });
        }

        // -------------------------------------------------
        // 6. Redirect to login
        // -------------------------------------------------

        return res.redirect("/login?passwordSet=1");
    } catch (error) {
        console.error("Set Password Error:", error);
        return next(error);
    }
};
