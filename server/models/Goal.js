const mongoose = require("mongoose");

const checkinSchema = new mongoose.Schema(
  {
    quarter: {
      type: String,
      required: true
    },
    achievement: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ["Not Started", "On Track", "Completed"],
      default: "Not Started"
    },
    comment: {
      type: String,
      default: ""
    },
    managerComment: {
      type: String,
      default: ""
    },
    score: {
      type: Number,
      default: 0
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const goalSchema = new mongoose.Schema(
  {
    cycleId: {
      type: String,
      default: "2026"
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    thrustArea: {
      type: String,
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    uom: {
      type: String,
      enum: [
        "Numeric Min",
        "Numeric Max",
        "Percentage Min",
        "Percentage Max",
        "Timeline",
        "Zero-based"
      ],
      required: true
    },
    target: {
      type: Number,
      required: true
    },
    deadline: {
      type: Date,
      default: null
    },
    weightage: {
      type: Number,
      required: true,
      min: 10
    },
    status: {
      type: String,
      enum: [
        "Draft",
        "Submitted",
        "Approved",
        "Rejected",
        "Rework",
        "Completed"
      ],
      default: "Draft"
    },
    sharedGoal: {
      type: Boolean,
      default: false
    },
    primaryOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    locked: {
      type: Boolean,
      default: false
    },
    actuals: {
      type: Number,
      default: 0
    },
    progressStatus: {
      type: String,
      enum: ["Not Started", "On Track", "Completed"],
      default: "Not Started"
    },
    progressScore: {
      type: Number,
      default: 0
    },
    managerComment: {
      type: String,
      default: ""
    },
    submissionComment: {
      type: String,
      default: ""
    },
    editAccess: {
      status: {
        type: String,
        enum: ["none", "pending", "granted", "expired"],
        default: "none"
      },
      requestedByManagerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },
      requestedAt: {
        type: Date,
        default: null
      },
      requestComment: {
        type: String,
        default: ""
      },
      grantedByAdminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },
      grantedAt: {
        type: Date,
        default: null
      },
      expiresAt: {
        type: Date,
        default: null
      }
    },
    checkins: [checkinSchema]
  },
  {
    timestamps: true
  }
);

goalSchema.index({ ownerId: 1, cycleId: 1 });
goalSchema.index({ status: 1 });
goalSchema.index({ managerId: 1 });

module.exports = mongoose.model("Goal", goalSchema);
