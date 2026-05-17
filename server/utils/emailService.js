const nodemailer = require("nodemailer");
const escapeHtml = require("escape-html");

const getTransporter = () => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const getAppBaseUrl = () =>
  (process.env.APP_URL || "http://localhost:5000").replace(/\/+$/, "");

const buildAppLink = (path = "") => {
  if (!path) {
    return getAppBaseUrl();
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${getAppBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
};

const buildEmailTemplate = ({
  heading,
  preview,
  message,
  ctaLabel = "Open GoalSync",
  ctaUrl = getAppBaseUrl(),
  metaLines = []
}) => {
  const resolvedUrl = buildAppLink(ctaUrl);
  const resolvedPreview = preview || message;
  const safeHeading = escapeHtml(heading);
  const safeMessage = escapeHtml(message);

  return {
    text: [heading, "", resolvedPreview, "", `${ctaLabel}: ${resolvedUrl}`, ...metaLines].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px;color:#1f2937;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f0;border-radius:18px;padding:32px;">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">GoalSync Notification</div>
          <h2 style="margin:0 0 12px;font-size:24px;color:#17386f;">${safeHeading}</h2>
          <p style="margin:0 0 18px;line-height:1.6;color:#475569;">${safeMessage}</p>
          ${
            metaLines.length
              ? `<div style="margin:0 0 22px;padding:14px 16px;border-radius:14px;background:#f8fbff;border:1px solid #e2e8f0;">
                  ${metaLines.map((line) => `<div style="font-size:14px;color:#334155;margin:4px 0;">${escapeHtml(line)}</div>`).join("")}
                </div>`
              : ""
          }
          <a href="${resolvedUrl}" style="display:inline-block;background:#1f4b99;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:600;">${escapeHtml(ctaLabel)}</a>
          <p style="margin:22px 0 0;font-size:12px;color:#6b7280;">If the button does not work, open ${resolvedUrl}</p>
        </div>
      </div>
    `
  };
};

const sendEmail = async ({ to, subject, html, text }) => {
  const transporter = getTransporter();

  if (!transporter || !to) {
    console.log("Email skipped:", subject);
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || `"Goal Sync" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text
    });
  } catch (error) {
    console.error("Email error:", error.message);
  }
};

module.exports = { sendEmail, buildEmailTemplate, buildAppLink, getAppBaseUrl };
