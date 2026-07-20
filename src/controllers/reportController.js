const { createSalaryReportPdf } = require("../services/pdfService");
const { buildSalaryReport } = require("../services/reportService");

const downloadSalaryReport = async (req, res, next) => {
  try {
    const report = await buildSalaryReport({
      month: req.query.month,
      userId: req.query.userId,
      year: req.query.year,
    });
    const fileSafeName = report.employee.username
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    const filename = `${fileSafeName || "employee"}-salary-${report.year}-${String(
      report.month
    ).padStart(2, "0")}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    createSalaryReportPdf(report, res);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  downloadSalaryReport,
};
