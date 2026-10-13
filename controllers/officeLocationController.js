
"use strict";

const mongoose = require("mongoose");

const OfficeLocation = require("../models/OfficeLocation");
const User = require("../models/User");

// =====================================================
// CONFIGURATION
// =====================================================

const MIN_RADIUS_METERS = 10;
const MAX_RADIUS_METERS = 5000;
const DEFAULT_RADIUS_METERS = 100;

const SETTINGS_VIEW = "organization/office-location";

// =====================================================
// USER / ORGANIZATION HELPERS
// =====================================================

function getUserId(req) {
    return (
        req.session?.user?._id ||
        req.session?.user?.id ||
        req.session?.userId ||
        null
    );
}

function normalizeObjectId(value) {
    if (!value) return null;

    const candidate =
        typeof value === "object"
            ? value._id || value.id
            : value;

    if (!candidate || !mongoose.isValidObjectId(String(candidate))) {
        return null;
    }

    return new mongoose.Types.ObjectId(String(candidate));
}

async function getRequestContext(req) {
    const userId = normalizeObjectId(getUserId(req));

    if (!userId) {
        return {
            error: "Please log in to manage office location.",
            status: 401
        };
    }

    // Read organization context from the database rather than
    // relying only on session values that may be stale.
    const user = await User.findById(userId)
        .select("_id organization organizationId status")
        .lean();

    if (!user) {
        return {
            error: "User account not found.",
            status: 401
        };
    }

    if (
        user.status &&
        String(user.status).toUpperCase() !== "ACTIVE"
    ) {
        return {
            error: "Your account is not active.",
            status: 403
        };
    }

    const organizationId = normalizeObjectId(
        user.organizationId || user.organization
    );

    if (!organizationId) {
        return {
            error: "Valid organization context is required.",
            status: 400
        };
    }

    return {
        userId,
        organizationId
    };
}

// =====================================================
// VIEW HELPER
// =====================================================

function renderSettings(res, {
    office = null,
    error = null,
    success = null,
    status = 200
}) {
    return res.status(status).render(SETTINGS_VIEW, {
        title: "Office Attendance Location",
        office,
        error,
        success,
        defaultRadiusMeters: DEFAULT_RADIUS_METERS
    });
}

// =====================================================
// GET /office-location
// =====================================================

exports.getSettings = async (req, res, next) => {
    try {
        const context = await getRequestContext(req);

        if (context.error) {
            return res.status(context.status).send(context.error);
        }

        const office = await OfficeLocation.findOne({
            organization: context.organizationId
        }).lean();

        return renderSettings(res, {
            office,
            error: null,
            success: null
        });
    } catch (error) {
        return next(error);
    }
};

// =====================================================
// POST /office-location
// =====================================================

exports.saveSettings = async (req, res, next) => {
    try {
        const context = await getRequestContext(req);

        if (context.error) {
            return res.status(context.status).send(context.error);
        }

        const { organizationId, userId } = context;

        const currentOffice = await OfficeLocation.findOne({
            organization: organizationId
        }).lean();

        const latitudeInput = req.body?.latitude;
        const longitudeInput = req.body?.longitude;
        const radiusInput = req.body?.radiusMeters;

        // Reject missing values rather than converting empty strings
        // into zero using Number("").
        if (
            latitudeInput === undefined ||
            longitudeInput === undefined ||
            String(latitudeInput).trim() === "" ||
            String(longitudeInput).trim() === ""
        ) {
            return renderSettings(res, {
                office: {
                    ...(currentOffice || {}),
                    latitude: latitudeInput ?? currentOffice?.latitude ?? "",
                    longitude: longitudeInput ?? currentOffice?.longitude ?? "",
                    radiusMeters:
                        radiusInput ?? currentOffice?.radiusMeters ??
                        DEFAULT_RADIUS_METERS
                },
                error: "Enter both office latitude and longitude.",
                status: 400
            });
        }

        const latitude = Number(latitudeInput);
        const longitude = Number(longitudeInput);

        if (
            !Number.isFinite(latitude) ||
            latitude < -90 ||
            latitude > 90 ||
            !Number.isFinite(longitude) ||
            longitude < -180 ||
            longitude > 180
        ) {
            return renderSettings(res, {
                office: {
                    ...(currentOffice || {}),
                    latitude: latitudeInput,
                    longitude: longitudeInput,
                    radiusMeters: radiusInput || currentOffice?.radiusMeters ||
                        DEFAULT_RADIUS_METERS
                },
                error: "Enter valid coordinates. Latitude must be -90 to 90 and longitude -180 to 180.",
                status: 400
            });
        }

        // Use the configured radius when the form omits it;
        // use 100 meters for a new office configuration.
        const radiusValue =
            radiusInput === undefined || String(radiusInput).trim() === ""
                ? currentOffice?.radiusMeters ?? DEFAULT_RADIUS_METERS
                : Number(radiusInput);

        if (
            !Number.isInteger(radiusValue) ||
            radiusValue < MIN_RADIUS_METERS ||
            radiusValue > MAX_RADIUS_METERS
        ) {
            return renderSettings(res, {
                office: {
                    ...(currentOffice || {}),
                    latitude,
                    longitude,
                    radiusMeters: radiusInput
                },
                error:
                    `Radius must be a whole number from ${MIN_RADIUS_METERS} to ${MAX_RADIUS_METERS} meters.`,
                status: 400
            });
        }

        const update = {
            $set: {
                latitude,
                longitude,
                radiusMeters: radiusValue,
                isActive: true,
                updatedBy: userId
            },
            $setOnInsert: {
                organization: organizationId
            }
        };

        let office;

        try {
            office = await OfficeLocation.findOneAndUpdate(
                { organization: organizationId },
                update,
                {
                    new: true,
                    upsert: true,
                    runValidators: true,
                    setDefaultsOnInsert: true
                }
            );
        } catch (error) {
            // If another request inserted the organization record
            // concurrently, retry as an update without upsert.
            if (error.code !== 11000) {
                throw error;
            }

            office = await OfficeLocation.findOneAndUpdate(
                { organization: organizationId },
                {
                    $set: {
                        latitude,
                        longitude,
                        radiusMeters: radiusValue,
                        isActive: true,
                        updatedBy: userId
                    }
                },
                {
                    new: true,
                    runValidators: true
                }
            );

            if (!office) {
                throw error;
            }
        }

        return renderSettings(res, {
            office: office.toObject
                ? office.toObject()
                : office,
            success: "Office attendance location saved successfully."
        });
    } catch (error) {
        console.error("Save Office Location Error:", error);

        if (error.name === "ValidationError" || error.name === "CastError") {
            return renderSettings(res, {
                error: "Invalid office location settings. Please check your entries.",
                status: 400
            });
        }

        return next(error);
    }
};
