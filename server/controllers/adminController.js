const Goal = require("../models/Goal");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const Escalation = require("../models/Escalation");
const Notification = require("../models/Notification");
const { toCsv, toExcelTable } = require("../utils/csvUtils");
const logAudit = require("../utils/auditLogger");
const { deleteExpiredEscalations, getEscalationCutoff } = require("../utils/escalationService");

const getAuditLogs = async (req, res) => {
  const logs = await AuditLog.find()
    .populate("userId", "name email role")
    .sort({ timestamp: -1 })
    .limit(200);

  res.json(logs);
};

const getReports = async (req, res) => {
  const filter = {};

  if (req.query.employeeId) {
    filter.ownerId = req.query.employeeId;
  }

  if (req.query.department) {
    const users = await User.find({ department: req.query.department }).select("_id");
    filter.ownerId = { $in: users.map((user) => user._id) };
  }

  const goals = await Goal.find(filter).populate("ownerId", "name department email");

  const rows = goals.map((goal) => ({
    employee: goal.ownerId?.name || "",
    email: goal.ownerId?.email || "",
    department: goal.ownerId?.department || "",
    title: goal.title,
    thrustArea: goal.thrustArea,
    status: goal.status,
    target: goal.target,
    actuals: goal.actuals,
    progressScore: `${goal.progressScore}%`,
    quarter: req.query.quarter || "All"
  }));

  if (req.query.export === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=achievement-report.csv");
    return res.send(toCsv(rows));
  }

  if (req.query.export === "excel") {
    res.setHeader("Content-Type", "application/vnd.ms-excel");
    res.setHeader("Content-Disposition", "attachment; filename=achievement-report.xls");
    return res.send(toExcelTable(rows));
  }

  res.json(rows);
};

const getEscalations = async (req, res) => {
  await deleteExpiredEscalations();

  const escalations = await Escalation.find({
    createdAt: { $gte: getEscalationCutoff() }
  })
    .populate("targetUserId", "name email role")
    .populate("goalId", "title status")
    .sort({ createdAt: -1 });

  res.json(escalations);
};

const getDashboard = async (req, res) => {
  await deleteExpiredEscalations();

  const goals = await Goal.find().populate("ownerId", "department name managerId").populate("managerId", "name");
  const users = await User.find().populate("managerId", "name");
  const notifications = await Notification.find().sort({ createdAt: -1 }).limit(10);
  const escalations = await Escalation.find({
    createdAt: { $gte: getEscalationCutoff() }
  }).sort({ createdAt: -1 }).limit(20);
  const lockedGoals = await Goal.find({ locked: true })
    .populate("ownerId", "name department")
    .sort({ updatedAt: -1 })
    .limit(20);
  const accessRequests = await Goal.find({
    "editAccess.status": { $in: ["pending", "granted"] }
  })
    .populate("ownerId", "name department")
    .populate("editAccess.requestedByManagerId", "name email")
    .populate("editAccess.grantedByAdminId", "name")
    .sort({ "editAccess.requestedAt": -1 })
    .limit(30);

  const approvedGoals = goals.filter((goal) => goal.status === "Approved").length;
  const organizationCompletion = goals.length ? Math.round((approvedGoals / goals.length) * 100) : 0;
  const departmentMap = {};

  goals.forEach((goal) => {
    const department = goal.ownerId?.department || "Unknown";
    if (!departmentMap[department]) {
      departmentMap[department] = { total: 0, completed: 0 };
    }
    departmentMap[department].total += 1;
    if (goal.progressStatus === "Completed") {
      departmentMap[department].completed += 1;
    }
  });

  const employees = users.filter((user) => user.role === "Employee");
  const managers = users.filter((user) => user.role === "Manager");

  const completionByEmployee = employees.map((employee) => {
    const employeeGoals = goals.filter((goal) => String(goal.ownerId?._id) === String(employee._id));
    const approvedGoals = employeeGoals.filter((goal) => goal.status === "Approved");
    const checkinDone = approvedGoals.filter((goal) => goal.checkins.length > 0).length;

    return {
      name: employee.name,
      department: employee.department,
      manager: employee.managerId?.name || "-",
      approvedGoals: approvedGoals.length,
      completedCheckins: checkinDone,
      completionStatus: approvedGoals.length > 0 && checkinDone === approvedGoals.length ? "Complete" : "Pending"
    };
  });

  const completionByManager = managers.map((manager) => {
    const teamEmployees = completionByEmployee.filter((employee) => employee.manager === manager.name);
    const completedCount = teamEmployees.filter((employee) => employee.completionStatus === "Complete").length;

    return {
      name: manager.name,
      department: manager.department,
      teamSize: teamEmployees.length,
      fullyCompletedEmployees: completedCount,
      completionRate: teamEmployees.length ? Math.round((completedCount / teamEmployees.length) * 100) : 0
    };
  });

  res.json({
    summary: {
      userCount: users.length,
      goalCount: goals.length,
      organizationCompletion,
      escalationCount: escalations.length
    },
    departmentAnalytics: Object.keys(departmentMap).map((department) => ({
      department,
      completion:
        departmentMap[department].total === 0
          ? 0
          : Math.round((departmentMap[department].completed / departmentMap[department].total) * 100)
    })),
    completionByEmployee,
    completionByManager,
    lockedGoals: lockedGoals.map((goal) => ({
      id: goal._id,
      title: goal.title,
      employee: goal.ownerId?.name || "",
      department: goal.ownerId?.department || "",
      status: goal.status,
      editAccessStatus: goal.editAccess?.status || "none",
      requestedBy: goal.editAccess?.requestedByManagerId?.name || "",
      requestComment: goal.editAccess?.requestComment || ""
    })),
    accessRequests: accessRequests.map((goal) => ({
      id: goal._id,
      title: goal.title,
      employee: goal.ownerId?.name || "",
      department: goal.ownerId?.department || "",
      status: goal.editAccess?.status || "none",
      requestedAt: goal.editAccess?.requestedAt || null,
      expiresAt: goal.editAccess?.expiresAt || null,
      requestComment: goal.editAccess?.requestComment || "",
      requestedBy: goal.editAccess?.requestedByManagerId?.name || "",
      grantedBy: goal.editAccess?.grantedByAdminId?.name || ""
    })),
    notifications,
    escalations
  });
};

const resolveEscalation = async (req, res) => {
  const escalation = await Escalation.findById(req.params.id);

  if (!escalation) {
    return res.status(404).json({ message: "Escalation not found" });
  }

  escalation.resolved = true;
  await escalation.save();

  await logAudit(req.user._id, "ESCALATION_RESOLVED", null, escalation.toObject());

  res.json({ message: "Escalation resolved", escalation });
};

module.exports = {
  getAuditLogs,
  getReports,
  getEscalations,
  getDashboard,
  resolveEscalation
};
