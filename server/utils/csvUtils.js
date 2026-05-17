const toCsv = (rows) => {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];

  rows.forEach((row) => {
    const values = headers.map((header) => {
      const value = row[header] ?? "";
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    lines.push(values.join(","));
  });

  return lines.join("\n");
};

const toExcelTable = (rows) => {
  if (!rows.length) {
    return "<table><tr><td>No data</td></tr></table>";
  }

  const headers = Object.keys(rows[0]);
  const headerRow = headers.map((item) => `<th>${item}</th>`).join("");
  const bodyRows = rows
    .map((row) => {
      const columns = headers.map((header) => `<td>${row[header] ?? ""}</td>`).join("");
      return `<tr>${columns}</tr>`;
    })
    .join("");

  return `<table border="1"><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;
};

module.exports = { toCsv, toExcelTable };
