const PDFDocument = require("pdfkit");

const formatMoney = amount =>
  `Rs. ${Math.round(Number(amount || 0)).toLocaleString("en-IN")}`;

const monthLabel = (month, year) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  });

const writeKeyValue = (doc, label, value, x, y, width = 120) => {
  doc.fillColor("#7f1d1d").fontSize(7).font("Helvetica-Bold").text(label, x, y, {
    width,
  });
  doc.fillColor("#111827").fontSize(10).font("Helvetica-Bold").text(value, x, y + 11, {
    width,
  });
};

const drawSectionTitle = (doc, title) => {
  if (doc.y > 740) {
    doc.addPage();
  }

  doc.moveDown(1.2);
  doc.fillColor("#111827").fontSize(12).font("Helvetica-Bold").text(title);
  doc.moveTo(doc.x, doc.y + 4).lineTo(560, doc.y + 4).strokeColor("#e5e7eb").stroke();
  doc.moveDown(0.8);
};

const drawTable = (doc, columns, rows, options = {}) => {
  const startX = options.x || 34;
  const rowPadding = 5;
  const headerHeight = 22;
  const rowHeight = options.rowHeight || 28;
  const tableHeight =
    headerHeight +
    rows.reduce((total, row) => total + (row.height || rowHeight), 0);
  let y = doc.y;

  if (options.keepTogether && y + tableHeight > 790) {
    doc.addPage();
    y = 34;
  }

  const drawHeader = () => {
    let x = startX;
    doc.rect(startX, y, columns.reduce((total, column) => total + column.width, 0), headerHeight)
      .fill("#f9fafb");
    columns.forEach(column => {
      doc
        .fillColor("#374151")
        .font("Helvetica-Bold")
        .fontSize(7)
        .text(column.label, x + rowPadding, y + 7, {
          width: column.width - rowPadding * 2,
        });
      x += column.width;
    });
    y += headerHeight;
  };

  drawHeader();

  rows.forEach(row => {
    const height = row.height || rowHeight;

    if (y + height > 790) {
      doc.addPage();
      y = 34;
      drawHeader();
    }

    let x = startX;
    doc.rect(startX, y, columns.reduce((total, column) => total + column.width, 0), height)
      .strokeColor("#e5e7eb")
      .stroke();

    columns.forEach(column => {
      const value = column.render ? column.render(row) : row[column.key] || "-";
      doc
        .fillColor(column.color ? column.color(row) : "#111827")
        .font(column.bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(column.fontSize || 8)
        .text(String(value), x + rowPadding, y + 6, {
          width: column.width - rowPadding * 2,
        });
      x += column.width;
    });

    y += height;
  });

  doc.y = y;
};

const createSalaryReportPdf = (report, outputStream) => {
  const doc = new PDFDocument({
    margin: 34,
    size: "A4",
  });

  doc.pipe(outputStream);

  doc.fillColor("#dc2626").font("Helvetica-Bold").fontSize(22).text("Corbital Enterprise");
  doc
    .fillColor("#111827")
    .fontSize(15)
    .text("Employee Monthly Salary Report", 34, 60);
  doc
    .fillColor("#6b7280")
    .font("Helvetica")
    .fontSize(9)
    .text(`Report Month: ${monthLabel(report.month, report.year)}`, 34, 82);
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Private Employee Copy", 390, 42, { align: "right", width: 170 });
  doc
    .fillColor("#6b7280")
    .font("Helvetica")
    .fontSize(8)
    .text(`Generated: ${report.generatedAt.toLocaleDateString("en-IN")}`, 390, 58, {
      align: "right",
      width: 170,
    });
  doc.moveTo(34, 102).lineTo(560, 102).strokeColor("#dc2626").lineWidth(1.5).stroke();

  doc.roundedRect(34, 120, 526, 64, 8).fill("#111827");
  doc.fillColor("#fca5a5").font("Helvetica-Bold").fontSize(7).text("EMPLOYEE", 48, 137);
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(report.employee.username, 48, 151, { width: 260 });
  doc.fillColor("#fca5a5").font("Helvetica-Bold").fontSize(7).text("TOTAL PAYABLE", 390, 137);
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(formatMoney(report.salary.totalPayable), 390, 151, {
      align: "right",
      width: 150,
    });

  const cardY = 202;
  writeKeyValue(doc, "PRESENT DAYS", String(report.salary.presentDays), 34, cardY);
  writeKeyValue(doc, "PAID HOLIDAYS", String(report.salary.holidayDays), 165, cardY);
  writeKeyValue(doc, "ABSENT DAYS", String(report.salary.absentDays), 296, cardY);
  writeKeyValue(doc, "WORKED TIME", report.salary.totalWorkedTime, 427, cardY);
  doc.y = 240;

  drawSectionTitle(doc, "Salary And Target Summary");
  drawTable(
    doc,
    [
      { key: "label", label: "Item", width: 180, bold: true },
      { key: "value", label: "Value", width: 120 },
      { key: "label2", label: "Item", width: 140, bold: true },
      { key: "value2", label: "Value", width: 86 },
    ],
    [
      {
        label: "Fixed Salary",
        label2: "Variable Salary",
        value: formatMoney(report.employee.fixedSalary),
        value2: formatMoney(report.employee.variableSalary),
      },
      {
        label: "Monthly Target",
        label2: "Added Value",
        value: formatMoney(report.salary.targetAmount),
        value2: formatMoney(report.salary.addedValue),
      },
      {
        label: "Target Achievement",
        label2: "Variable Payable",
        value: `${Math.round(report.salary.targetAchievement * 100)}%`,
        value2: formatMoney(report.salary.variablePayable),
      },
    ],
    { keepTogether: true, rowHeight: 26 }
  );

  drawSectionTitle(doc, "Day-wise Attendance With Full Time");
  drawTable(
    doc,
    [
      { key: "dateLabel", label: "Date", width: 72 },
      {
        key: "status",
        label: "Status",
        width: 55,
        bold: true,
        render: row => row.statusLabel || row.status,
        color: row =>
          row.status === "Present"
            ? "#166534"
            : row.status === "Holiday"
              ? "#1d4ed8"
              : "#991b1b",
      },
      { key: "checkIn", label: "Punch In", width: 100 },
      { key: "checkOut", label: "Punch Out", width: 100 },
      { key: "workedTime", label: "Worked", width: 78 },
      {
        key: "hourlyPayable",
        label: "Payable",
        width: 95,
        bold: true,
        color: () => "#7f1d1d",
        render: row => formatMoney(row.hourlyPayable),
      },
    ],
    report.attendanceRows,
    { rowHeight: 28 }
  );

  drawSectionTitle(doc, "Added Values This Month");
  const valueRows = report.valueEntries.length
    ? report.valueEntries.map(entry => ({
        dateLabel: entry.dateLabel,
        purchaseAmount: formatMoney(entry.purchaseAmount),
        sellAmount: formatMoney(entry.sellAmount),
      }))
    : [{ dateLabel: "-", purchaseAmount: "-", sellAmount: "-" }];
  drawTable(
    doc,
    [
      { key: "dateLabel", label: "Date", width: 176 },
      { key: "purchaseAmount", label: "Purchase", width: 175 },
      { key: "sellAmount", label: "Sell / Added", width: 175 },
    ],
    valueRows,
    { rowHeight: 26 }
  );

  const salaryCalculationRows = [
    { label: "Fixed salary", value: formatMoney(report.employee.fixedSalary) },
    { label: "Calendar days used for salary", value: String(report.salary.salaryDays) },
    { label: "Salary calculation hours", value: `${report.salary.salaryDays * 8}h` },
    { label: "Hourly salary", value: formatMoney(report.salary.hourlySalary) },
    { label: "Payable days, present plus paid holidays", value: String(report.salary.payableDays) },
    { label: "Fixed payable", value: formatMoney(report.salary.fixedPayable) },
    {
      label: `Variable payable, based on ${Math.round(report.salary.targetAchievement * 100)}% target achievement`,
      value: formatMoney(report.salary.variablePayable),
    },
    { label: "Total payable salary", value: formatMoney(report.salary.totalPayable) },
  ];
  const salaryCalculationBlockHeight = 34 + 22 + salaryCalculationRows.length * 26;

  if (doc.y + salaryCalculationBlockHeight > 790) {
    doc.addPage();
  }

  drawSectionTitle(doc, "Salary Calculation");
  drawTable(
    doc,
    [
      { key: "label", label: "Calculation", width: 330, bold: true },
      { key: "value", label: "Amount", width: 196 },
    ],
    salaryCalculationRows,
    { keepTogether: true, rowHeight: 26 }
  );

  doc.end();
};

module.exports = {
  createSalaryReportPdf,
};
