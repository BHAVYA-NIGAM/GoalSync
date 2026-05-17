const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { validationResult } = require("express-validator");
const User = require("../models/User");
const Notification = require("../models/Notification");
const logAudit = require("../utils/auditLogger");
const {
  isMicrosoftAuthConfigured,
  buildMicrosoftLoginUrl,
  exchangeCodeForToken,
  getMicrosoftUser,
  getCurrentUserManager,
  getUserGroups,
  mapRoleFromGroups,
  upsertMicrosoftUser,
  syncOrgHierarchy
} = require("../utils/msAuthService");
const { DEPARTMENTS } = require("../utils/constants");
const { getAppBaseUrl } = require("../utils/emailService");
const microsoftLoginStates = new Map();

const createToken = (user) =>
  jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d"
  });

const setTokenCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    path: "/"
  });
};

const sendAuthResponse = (res, statusCode, message, user) => {
  const token = createToken(user);
  setTokenCookie(res, token);
  res.status(statusCode).json({
    message,
    token, // Keeping for backward compatibility or mobile apps if needed
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      managerId: user.managerId
    }
  });
};

const validatePasswordStrength = (password) => {
  const minLength = 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return password.length >= minLength && hasUpper && hasLower && hasNumber && hasSpecial;
};

const register = async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, password, role, department, managerId } = req.body;

  if (!validatePasswordStrength(password)) {
    return res.status(400).json({ message: "Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character" });
  }

  if (!DEPARTMENTS.includes(department)) {
    return res.status(400).json({ message: "Please select a valid department" });
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ message: "Email already registered" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role: role || "Employee",
    department,
    managerId: managerId || null
  });

  await Notification.create({
    userId: user._id,
    title: "Welcome to GoalSync",
    message: "Your account has been created successfully.",
    type: "success"
  });

  await logAudit(user._id, "USER_REGISTERED", null, user.toObject());

  sendAuthResponse(res, 201, "Registration successful", user);
};

const login = async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return res.status(400).json({ message: "Invalid credentials" });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return res.status(400).json({ message: "Invalid credentials" });
  }

  await logAudit(user._id, "USER_LOGGED_IN", null, { email: user.email });

  sendAuthResponse(res, 200, "Login successful", user);
};

const ssoLogin = async (req, res) => {
  try {
    const { accessToken, role } = req.body;

    if (!accessToken) {
      return res.status(400).json({ message: "Microsoft access token is required" });
    }

    const profile = await getMicrosoftUser(accessToken);
    const user = await upsertMicrosoftUser(profile);

    if (role && ["Employee", "Manager", "Admin"].includes(role)) {
      user.role = role;
      await user.save();
    }

    await logAudit(user._id, "USER_SSO_LOGIN", null, {
      email: user.email,
      microsoftId: user.microsoftId
    });

    sendAuthResponse(res, 200, "SSO login successful", user);
  } catch (error) {
    res.status(400).json({ message: error.message || "SSO login failed" });
  }
};

const entraLogin = async (req, res) => {
  if (!isMicrosoftAuthConfigured()) {
    return res.redirect(
      `${getAppBaseUrl()}/public/pages/login.html#error=${encodeURIComponent("Microsoft login is not configured yet")}`
    );
  }

  const state = crypto.randomUUID();
  microsoftLoginStates.set(state, Date.now() + 10 * 60 * 1000);
  res.redirect(buildMicrosoftLoginUrl(state));
};

const entraCallback = async (req, res) => {
  try {
    if (!isMicrosoftAuthConfigured()) {
      throw new Error("Microsoft login is not configured yet");
    }

    if (!req.query.code) {
      throw new Error("Microsoft did not return an authorization code");
    }

    const state = String(req.query.state || "");
    const stateExpiry = microsoftLoginStates.get(state);
    microsoftLoginStates.delete(state);

    if (!state || !stateExpiry || stateExpiry < Date.now()) {
      throw new Error("Microsoft login state is invalid or expired");
    }

    const tokenData = await exchangeCodeForToken(req.query.code);
    const profile = await getMicrosoftUser(tokenData.access_token);
    const managerProfile = await getCurrentUserManager(tokenData.access_token);
    const groups = await getUserGroups(tokenData.access_token);
    const user = await upsertMicrosoftUser(profile);

    user.role = mapRoleFromGroups(groups);
    await syncOrgHierarchy(user, profile, managerProfile);

    await logAudit(user._id, "USER_SSO_LOGIN", null, {
      email: user.email,
      microsoftId: user.microsoftId,
      groups: groups.map((group) => group.displayName)
    });

    const session = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      managerId: user.managerId
    };
    const token = createToken(user);

    setTokenCookie(res, token);

    res.redirect(
      `${getAppBaseUrl()}/public/pages/login.html#token=${encodeURIComponent(token)}&user=${encodeURIComponent(
        JSON.stringify(session)
      )}`
    );
  } catch (error) {
    res.redirect(
      `${getAppBaseUrl()}/public/pages/login.html#error=${encodeURIComponent(
        error.message || "Microsoft login failed"
      )}`
    );
  }
};

const me = async (req, res) => {
  res.json(req.user);
};

const updateProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const before = user.toObject();
  const { name, department, password } = req.body;

  if (name) {
    user.name = name.trim();
  }

  if (department) {
    if (!DEPARTMENTS.includes(department)) {
      return res.status(400).json({ message: "Please select a valid department" });
    }
    user.department = department;
  }

  if (password) {
    if (!validatePasswordStrength(password)) {
      return res.status(400).json({ message: "Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character" });
    }
    user.password = await bcrypt.hash(password, 10);
  }

  await user.save();
  await logAudit(req.user._id, "PROFILE_UPDATED", before, user.toObject());

  res.json({
    message: "Profile updated successfully",
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      managerId: user.managerId
    }
  });
};

const listManagers = async (req, res) => {
  const managers = await User.find({ role: { $in: ["Manager", "Admin"] } }).select("name email department role");
  res.json(managers);
};

const getDepartments = async (req, res) => {
  res.json(DEPARTMENTS);
};

const getNotifications = async (req, res) => {
  const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100);
  const unreadCount = notifications.filter((item) => !item.read).length;

  res.json({ notifications, unreadCount });
};

const markNotificationsRead = async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
  res.json({ message: "Notifications marked as read" });
};

const logout = (req, res) => {
  res.cookie("token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    path: "/"
  });
  res.json({ message: "Logged out successfully" });
};

module.exports = {
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
};
