const getCycleWindow = (date = new Date()) => {
  const month = date.getMonth() + 1;

  if (month === 5 || month === 6) {
    return { key: "GOAL_SETTING", label: "Goal Setting", active: true };
  }

  if (month === 7 || month === 8 || month === 9) {
    return { key: "Q1", label: "Q1 Check-In", active: month === 7 };
  }

  if (month === 10 || month === 11 || month === 12) {
    return { key: "Q2", label: "Q2 Check-In", active: month === 10 };
  }

  if (month === 1 || month === 2) {
    return { key: "Q3", label: "Q3 Check-In", active: month === 1 };
  }

  if (month === 3 || month === 4) {
    return { key: "Q4", label: "Q4 Check-In", active: true };
  }

  return { key: "UNKNOWN", label: "Closed", active: false };
};

const canSubmitCheckin = () => {
  const current = getCycleWindow();
  return ["Q1", "Q2", "Q3", "Q4"].includes(current.key) && current.active;
};

module.exports = { getCycleWindow, canSubmitCheckin };
