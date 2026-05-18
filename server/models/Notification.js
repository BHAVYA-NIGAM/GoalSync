const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      default: "info",
    },
    link: {
      type: String,
      default: "",
    },
    entityType: {
      type: String,
      default: "",
    },
    entityId: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

notificationSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 60 * 60,
    partialFilterExpression: {
      type: "warning",
    },
  },
);

module.exports = mongoose.model("Notification", notificationSchema);
