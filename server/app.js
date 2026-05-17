const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const { doubleCsrf } = require("csrf-csrf");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const goalRoutes = require("./routes/goalRoutes");
const managerRoutes = require("./routes/managerRoutes");
const adminRoutes = require("./routes/adminRoutes");
const errorMiddleware = require("./middleware/errorMiddleware");
const { startEscalationEngine, runEscalationChecks } = require("./utils/escalationService");
const User = require("./models/User");
const axios = require("axios");

dotenv.config();
connectDB();

const app = express();

app.use(helmet({
  contentSecurityPolicy: false, // Disabling CSP for now to not break the frontend inline scripts, ideally configure this strictly.
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cookieParser(process.env.COOKIE_SECRET || "default_cookie_secret"));

app.use(cors({
  origin: process.env.APP_URL || "http://localhost:5000",
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.COOKIE_SECRET || "default_cookie_secret",
  cookieName: "__Host-psifi.x-csrf-token",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production"
  },
  size: 64,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  getTokenFromRequest: (req) => req.headers["x-csrf-token"]
});

app.get("/api/csrf-token", (req, res) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: "Too many requests from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

app.use("/api/auth", authRoutes);
const { entraCallback } = require("./controllers/authController");
app.get("/auth/entra/callback", entraCallback);

app.use("/api/goals", doubleCsrfProtection, goalRoutes);
app.use("/api/manager", doubleCsrfProtection, managerRoutes);
app.use("/api/admin", doubleCsrfProtection, adminRoutes);
app.use("/public", express.static(path.join(__dirname, "..", "public")));

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", uptime: process.uptime() });
});

app.get("/", (req, res) => {
  res.redirect("/public/pages/login.html");
});

app.use(errorMiddleware);

const seedDefaultAdmin = async () => {
  try {
    const email = process.env.DEFAULT_ADMIN_EMAIL;
    const password = process.env.DEFAULT_ADMIN_PASSWORD;

    if (!email || !password) {
      return;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      name: "GoalSync Admin",
      email,
      password: hashedPassword,
      role: "Admin",
      department: "HR",
    });

    console.log("Default admin created");
  } catch (error) {
    console.error("Admin seed error:", error.message);
  }
};

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, async () => {
  await seedDefaultAdmin();
  await runEscalationChecks();
  startEscalationEngine();
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log("Gracefully shutting down...");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

const URL = 'https://goalsync-e13q.onrender.com';

setInterval(async () => {
  try {
    const response = await axios.get(URL);
    console.log('Pinged successfully:', response.status);
  } catch (err) {
    console.log('Ping failed');
  }
}, 30000);