const sendTeamsNotification = async (title, message, deepLink = "") => {
  if (!process.env.TEAMS_WEBHOOK_URL) {
    console.log("Teams notification skipped:", title);
    return;
  }

  const body = {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    summary: title,
    themeColor: "2b6cb0",
    title,
    text: `${message}${deepLink ? `<br/><br/><a href="${deepLink}">Open GoalSync</a>` : ""}`
  };

  try {
    await fetch(process.env.TEAMS_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.error("Teams webhook error:", error.message);
  }
};

module.exports = { sendTeamsNotification };
