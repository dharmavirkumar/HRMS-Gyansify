"use strict";

const EARTH_RADIUS_METERS = 6371000;

function isValidCoordinate(value, min, max) {
    return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= min &&
        value <= max
    );
}

function calculateDistanceMeters(
    lat1,
    lon1,
    lat2,
    lon2
) {
    const toRadians = (degrees) =>
        degrees * (Math.PI / 180);

    const latitudeDifference = toRadians(lat2 - lat1);
    const longitudeDifference = toRadians(lon2 - lon1);

    const a =
        Math.sin(latitudeDifference / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(longitudeDifference / 2) ** 2;

    const boundedA = Math.min(1, Math.max(0, a));

    return (
        2 *
        EARTH_RADIUS_METERS *
        Math.asin(Math.sqrt(boundedA))
    );
}

function verifyCoordinates(latitude, longitude) {
    return (
        isValidCoordinate(latitude, -90, 90) &&
        isValidCoordinate(longitude, -180, 180)
    );
}

module.exports = {
    calculateDistanceMeters,
    verifyCoordinates
};