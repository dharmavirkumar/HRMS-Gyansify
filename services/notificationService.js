
const mongoose = require("mongoose");

const Notification = require("../models/Notification");
const User = require("../models/User");

// =====================================================
// CONSTANTS
// =====================================================

const NOTIFICATION_TYPES = [
    "GENERAL",
    "LEAVE",
    "ATTENDANCE",
    "PAYROLL",
    "RECRUITMENT",
    "PERFORMANCE",
    "DOCUMENT",
    "SYSTEM"
];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// =====================================================
// VALIDATION HELPERS
// =====================================================

function validateObjectId(id, fieldName = "ID") {
    if (!mongoose.isValidObjectId(id)) {
        throw new Error(`Invalid ${fieldName}.`);
    }
}

function normalizePagination(page = 1, limit = DEFAULT_LIMIT) {
    const currentPage = Math.max(1, Number(page) || 1);

    const pageSize = Math.min(
        MAX_LIMIT,
        Math.max(1, Number(limit) || DEFAULT_LIMIT)
    );

    return {
        page: currentPage,
        limit: pageSize,
        skip: (currentPage - 1) * pageSize
    };
}

// =====================================================
// VALIDATE USER
// =====================================================

async function validateUser(userId, organizationId) {
    validateObjectId(userId, "user ID");
    validateObjectId(organizationId, "organization ID");

    const user = await User.findOne({
        _id: userId,
        organization: organizationId,
        status: "ACTIVE"
    })
        .select("_id organization status")
        .lean();

    if (!user) {
        throw new Error(
            "Active user not found in this organization."
        );
    }

    return user;
}

// =====================================================
// CREATE NOTIFICATION
// =====================================================

async function createNotification({
    organizationId,
    recipientId,
    type = "GENERAL",
    title,
    message,
    link = null,
    metadata = {}
}) {
    validateObjectId(organizationId, "organization ID");
    validateObjectId(recipientId, "recipient ID");

    if (!NOTIFICATION_TYPES.includes(type)) {
        throw new Error("Invalid notification type.");
    }

    if (
        typeof title !== "string" ||
        !title.trim() ||
        title.trim().length > 150
    ) {
        throw new Error(
            "Notification title is required and must be at most 150 characters."
        );
    }

    if (
        typeof message !== "string" ||
        !message.trim() ||
        message.trim().length > 2000
    ) {
        throw new Error(
            "Notification message is required and must be at most 2000 characters."
        );
    }

    if (link !== null && typeof link !== "string") {
        throw new Error("Notification link must be a string or null.");
    }

    // Validate recipient and organization membership.
    await validateUser(recipientId, organizationId);

    return Notification.create({
        organization: organizationId,
        recipient: recipientId,
        type,
        title: title.trim(),
        message: message.trim(),
        link,
        metadata,
        isRead: false,
        readAt: null
    });
}

// =====================================================
// CREATE NOTIFICATIONS FOR MULTIPLE USERS
// =====================================================

async function createBulkNotifications({
    organizationId,
    recipientIds,
    type = "GENERAL",
    title,
    message,
    link = null,
    metadata = {}
}) {
    validateObjectId(organizationId, "organization ID");

    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
        throw new Error("At least one recipient is required.");
    }

    if (recipientIds.length > 1000) {
        throw new Error(
            "Maximum 1000 recipients are allowed per request."
        );
    }

    const uniqueRecipientIds = [
        ...new Set(recipientIds.map(String))
    ];

    for (const recipientId of uniqueRecipientIds) {
        validateObjectId(recipientId, "recipient ID");
    }

    if (!NOTIFICATION_TYPES.includes(type)) {
        throw new Error("Invalid notification type.");
    }

    if (
        typeof title !== "string" ||
        !title.trim() ||
        title.trim().length > 150
    ) {
        throw new Error("A valid notification title is required.");
    }

    if (
        typeof message !== "string" ||
        !message.trim() ||
        message.trim().length > 2000
    ) {
        throw new Error("A valid notification message is required.");
    }

    // Confirm every recipient belongs to this organization.
    const validUsers = await User.find({
        _id: { $in: uniqueRecipientIds },
        organization: organizationId,
        status: "ACTIVE"
    })
        .select("_id")
        .lean();

    if (validUsers.length !== uniqueRecipientIds.length) {
        throw new Error(
            "One or more recipients are invalid or belong to another organization."
        );
    }

    const documents = uniqueRecipientIds.map((recipientId) => ({
        organization: organizationId,
        recipient: recipientId,
        type,
        title: title.trim(),
        message: message.trim(),
        link,
        metadata,
        isRead: false,
        readAt: null
    }));

    return Notification.insertMany(documents);
}

// =====================================================
// GET USER NOTIFICATIONS
// =====================================================

async function getNotifications(
    organizationId,
    recipientId,
    { page = 1, limit = DEFAULT_LIMIT, unreadOnly = false } = {}
) {
    await validateUser(recipientId, organizationId);

    const pagination = normalizePagination(page, limit);

    const filter = {
        organization: organizationId,
        recipient: recipientId
    };

    if (unreadOnly) {
        filter.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(filter)
            .sort({ createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean(),

        Notification.countDocuments(filter),

        Notification.countDocuments({
            organization: organizationId,
            recipient: recipientId,
            isRead: false
        })
    ]);

    return {
        notifications,
        unreadCount,
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total,
            pages: Math.ceil(total / pagination.limit)
        }
    };
}

// =====================================================
// GET UNREAD NOTIFICATION COUNT
// =====================================================

async function getUnreadCount(organizationId, recipientId) {
    validateObjectId(organizationId, "organization ID");
    validateObjectId(recipientId, "recipient ID");

    return Notification.countDocuments({
        organization: organizationId,
        recipient: recipientId,
        isRead: false
    });
}

// =====================================================
// MARK ONE NOTIFICATION AS READ
// =====================================================

async function markAsRead(
    organizationId,
    recipientId,
    notificationId
) {
    validateObjectId(organizationId, "organization ID");
    validateObjectId(recipientId, "recipient ID");
    validateObjectId(notificationId, "notification ID");

    const notification = await Notification.findOneAndUpdate(
        {
            _id: notificationId,
            organization: organizationId,
            recipient: recipientId,
            isRead: false
        },
        {
            $set: {
                isRead: true,
                readAt: new Date()
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (notification) {
        return notification;
    }

    // Distinguish an already-read notification from a missing one.
    const existing = await Notification.findOne({
        _id: notificationId,
        organization: organizationId,
        recipient: recipientId
    });

    if (!existing) {
        throw new Error("Notification not found.");
    }

    return existing;
}

// =====================================================
// MARK ALL NOTIFICATIONS AS READ
// =====================================================

async function markAllAsRead(organizationId, recipientId) {
    validateObjectId(organizationId, "organization ID");
    validateObjectId(recipientId, "recipient ID");

    const result = await Notification.updateMany(
        {
            organization: organizationId,
            recipient: recipientId,
            isRead: false
        },
        {
            $set: {
                isRead: true,
                readAt: new Date()
            }
        },
        {
            runValidators: true
        }
    );

    return {
        modifiedCount: result.modifiedCount
    };
}

// =====================================================
// DELETE ONE NOTIFICATION
// =====================================================

async function deleteNotification(
    organizationId,
    recipientId,
    notificationId
) {
    validateObjectId(organizationId, "organization ID");
    validateObjectId(recipientId, "recipient ID");
    validateObjectId(notificationId, "notification ID");

    const result = await Notification.deleteOne({
        _id: notificationId,
        organization: organizationId,
        recipient: recipientId
    });

    if (result.deletedCount === 0) {
        throw new Error("Notification not found.");
    }

    return {
        success: true,
        message: "Notification deleted successfully."
    };
}

// =====================================================
// LEAVE NOTIFICATION HELPERS
// =====================================================

async function notifyLeaveDecision({
    organizationId,
    recipientId,
    decision,
    leaveRequestId
}) {
    const normalizedDecision = String(decision).toUpperCase();

    if (!["APPROVED", "REJECTED"].includes(normalizedDecision)) {
        throw new Error("Decision must be APPROVED or REJECTED.");
    }

    validateObjectId(leaveRequestId, "leave request ID");

    const isApproved = normalizedDecision === "APPROVED";

    return createNotification({
        organizationId,
        recipientId,
        type: "LEAVE",
        title: isApproved
            ? "Leave Request Approved"
            : "Leave Request Rejected",
        message: isApproved
            ? "Your leave request has been approved."
            : "Your leave request has been rejected.",
        link: "/leave",
        metadata: {
            leaveRequestId: String(leaveRequestId),
            decision: normalizedDecision
        }
    });
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    createNotification,
    createBulkNotifications,
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    notifyLeaveDecision
};