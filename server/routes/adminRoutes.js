const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const {
  getAuditLogs,
  getReports,
  getEscalations,
  getDashboard,
  resolveEscalation
} = require("../controllers/adminController");

const router = express.Router();

router.use(authMiddleware, roleMiddleware("Admin"));

router.get("/dashboard", getDashboard);
router.get("/audit-logs", getAuditLogs);
router.get("/reports", getReports);
router.get("/escalations", getEscalations);
router.post("/escalations/:id/resolve", resolveEscalation);

module.exports = router;
