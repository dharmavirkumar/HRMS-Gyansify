const mongoose = require("mongoose");

const assetSchema = new mongoose.Schema(
    {
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true
        },

        assetId: {
            type: String,
            required: true,
            trim: true
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        category: {
            type: String,
            required: true,
            trim: true
        },

        brand: {
            type: String,
            trim: true
        },

        model: {
            type: String,
            trim: true
        },

        serialNumber: {
            type: String,
            trim: true
        },

        purchaseDate: {
            type: Date
        },

        purchasePrice: {
            type: Number,
            default: 0
        },

        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null
        },

        assignedDate: {
            type: Date
        },

        condition: {
            type: String,
            enum: [
                "NEW",
                "GOOD",
                "FAIR",
                "DAMAGED"
            ],
            default: "NEW"
        },

        status: {
            type: String,
            enum: [
                "AVAILABLE",
                "ASSIGNED",
                "MAINTENANCE",
                "LOST",
                "RETIRED"
            ],
            default: "AVAILABLE"
        },

        location: {
            type: String,
            trim: true
        },

        description: {
            type: String,
            trim: true
        }
    },
    {
        timestamps: true
    }
);

assetSchema.index({
    organization: 1,
    assetId: 1
});

assetSchema.index({
    organization: 1,
    status: 1
});

module.exports = mongoose.model("Asset", assetSchema);