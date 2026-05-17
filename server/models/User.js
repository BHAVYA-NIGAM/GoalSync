const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      default: ""
    },
    role: {
      type: String,
      enum: ["Employee", "Manager", "Admin"],
      default: "Employee"
    },
    department: {
      type: String,
      required: true,
      trim: true
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    microsoftId: {
      type: String,
      default: ""
    },
    entraEnabled: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

userSchema.index({ email: 1 });
userSchema.index({ department: 1, role: 1 });
userSchema.index({ managerId: 1 });

module.exports = mongoose.model("User", userSchema);
