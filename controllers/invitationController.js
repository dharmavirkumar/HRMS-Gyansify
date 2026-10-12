
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const hashToken = (token) =>
    crypto.createHash("sha256").update(token).digest("hex");

// Show password setup page
exports.getSetPassword = async (req, res) => {
    try {
        const { token, email } = req.query;

        if (
            typeof token !== "string" ||
            typeof email !== "string" ||
            !/^[a-f0-9]{64}$/i.test(token)
        ) {
            return res.status(400).render("auth/set-password", {
                title: "Set Password",
                error: "This invitation link is invalid or incomplete.",
                token: "",
                email: ""
            });
        }

        const user = await User.findOne({
            email: email.trim().toLowerCase(),
            invitationTokenHash: hashToken(token),
            invitationExpiresAt: { $gt: new Date() },
            status: "INACTIVE"
        }).select("+invitationTokenHash");

        if (!user) {
            return res.status(400).render("auth/set-password", {
                title: "Set Password",
                error: "This invitation has expired or is invalid. Please contact HR for a new invitation.",
                token: "",
                email: ""
            });
        }

        return res.render("auth/set-password", {
            title: "Set Your Password",
            error: null,
            token,
            email: user.email
        });
    } catch (error) {
        console.error("Get Set Password Error:", error);
        return res.status(500).send("Unable to open password setup page.");
    }
};

// Set password and activate employee account
exports.postSetPassword = async (req, res) => {
    try {
        const { token, email, password, confirmPassword } = req.body;

        if (
            typeof token !== "string" ||
            !/^[a-f0-9]{64}$/i.test(token) ||
            typeof email !== "string"
        ) {
            return res.status(400).send("Invalid invitation details.");
        }

        if (
            typeof password !== "string" ||
            password.length < 12 ||
            password.length > 128
        ) {
            return res.status(400).render("auth/set-password", {
                title: "Set Your Password",
                error: "Password must be between 12 and 128 characters.",
                token,
                email
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).render("auth/set-password", {
                title: "Set Your Password",
                error: "Passwords do not match.",
                token,
                email
            });
        }

        const user = await User.findOne({
            email: email.trim().toLowerCase(),
            invitationTokenHash: hashToken(token),
            invitationExpiresAt: { $gt: new Date() },
            status: "INACTIVE"
        }).select("+invitationTokenHash");

        if (!user) {
            return res.status(400).send(
                "This invitation has expired or has already been used. Please contact HR."
            );
        }

        user.password = await bcrypt.hash(password, 12);
        user.status = "ACTIVE";

        // Remove invitation credentials after successful use.
        user.invitationTokenHash = undefined;
        user.invitationExpiresAt = undefined;

        await user.save();

        return res.redirect("/login?passwordSet=1");
    } catch (error) {
        console.error("Set Password Error:", error);
        return res.status(500).send("Unable to set password. Please try again.");
    }
};