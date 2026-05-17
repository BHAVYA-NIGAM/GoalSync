const mongoose = require("mongoose");

const escalationSchema = new mongoose.Schema(
  {
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Goal",
      default: null
    },
    triggeredBy: {
      type: String,
      required: true
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    message: {
      type: String,
      required: true
    },
    resolved: {
      type: Boolean,
      default: false
    },
    retryCount: {
      type: Number,
      default: 0
    },
    lastAttempt: {
      type: Date,
      default: null
    },
    errorLogs: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Escalation", escalationSchema);
