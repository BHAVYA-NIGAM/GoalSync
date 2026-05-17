const AuditLog = require("../models/AuditLog");

const logAudit = async (userId, action, before, after) => {
  try {
    await AuditLog.create({
      userId,
      action,
      before,
      after
    });
  } catch (error) {
    console.error("Audit log error:", error.message);
  }
};

module.exports = logAudit;
