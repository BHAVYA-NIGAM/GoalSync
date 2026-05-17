const express = require("express");
const { body } = require("express-validator");
const authMiddleware = require("../middleware/authMiddleware");
const {
  register,
  login,
  logout,
  ssoLogin,
  entraLogin,
  entraCallback,
  me,
  updateProfile,
  listManagers,
  getDepartments,
  getNotifications,
  markNotificationsRead
} = require("../controllers/authController");

const router = express.Router();

router.post(
  "/register",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("department").notEmpty().withMessage("Department is required")
  ],
  register
);

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required")
  ],
  login
);

router.post("/logout", logout);

router.post("/sso", ssoLogin);
router.get("/entra/login", entraLogin);
router.get("/entra/callback", entraCallback);
router.get("/me", authMiddleware, me);
router.put("/profile", authMiddleware, updateProfile);
router.get("/notifications", authMiddleware, getNotifications);
router.put("/notifications/read", authMiddleware, markNotificationsRead);
router.get("/managers", listManagers);
router.get("/departments", getDepartments);

module.exports = router;
