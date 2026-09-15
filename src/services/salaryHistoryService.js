const SalaryHistory = require("../models/SalaryHistory");

const SALARY_TIMEZONE = "Asia/Kolkata";

const getMonthStart = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SALARY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find(part => part.type === "year")?.value);
  const month = Number(parts.find(part => part.type === "month")?.value);

  return new Date(Date.UTC(year, month - 1, 1));
};

const createInitialSalaryHistory = async (user, session) => {
  const [salaryHistory] = await SalaryHistory.create(
    [
      {
        userId: user._id,
        fixedSalary: user.fixedSalary,
        variableSalary: user.variableSalary,
        effectiveFrom: getMonthStart(),
        effectiveTo: null,
      },
    ],
    { session }
  );

  return salaryHistory;
};

const recordSalaryChange = async ({
  fixedSalary,
  previousFixedSalary,
  previousVariableSalary,
  session,
  user,
  variableSalary,
}) => {
  if (
    Number(fixedSalary) === Number(previousFixedSalary) &&
    Number(variableSalary) === Number(previousVariableSalary)
  ) {
    return null;
  }

  const effectiveFrom = getMonthStart();
  const activeSalary = await SalaryHistory.findOne({
    userId: user._id,
    effectiveTo: null,
  })
    .sort({ effectiveFrom: -1, createdAt: -1 })
    .session(session);

  if (activeSalary) {
    activeSalary.effectiveTo = effectiveFrom;
    await activeSalary.save({ session });
  } else {
    await SalaryHistory.create(
      [
        {
          userId: user._id,
          fixedSalary: previousFixedSalary,
          variableSalary: previousVariableSalary,
          effectiveFrom: getMonthStart(user.createdAt || effectiveFrom),
          effectiveTo: effectiveFrom,
        },
      ],
      { session }
    );
  }

  const [newSalaryHistory] = await SalaryHistory.create(
    [
      {
        userId: user._id,
        fixedSalary,
        variableSalary,
        effectiveFrom,
        effectiveTo: null,
      },
    ],
    { session }
  );

  return newSalaryHistory;
};

const getSalaryForMonth = async ({ month, user, year }) => {
  const reportMonth = new Date(Date.UTC(year, month - 1, 1));
  const salaryHistory = await SalaryHistory.findOne({
    userId: user._id,
    effectiveFrom: { $lte: reportMonth },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: reportMonth } }],
  }).sort({ effectiveFrom: -1, createdAt: -1 });

  if (salaryHistory) {
    return {
      fixedSalary: salaryHistory.fixedSalary,
      variableSalary: salaryHistory.variableSalary,
    };
  }

  const hasSalaryHistory = await SalaryHistory.exists({ userId: user._id });

  if (hasSalaryHistory) {
    const error = new Error("No salary is configured for the selected month.");
    error.statusCode = 400;
    throw error;
  }

  // Existing users created before salary history was introduced keep working
  // until their first salary update creates the historical baseline.
  return {
    fixedSalary: user.fixedSalary,
    variableSalary: user.variableSalary,
  };
};

module.exports = {
  createInitialSalaryHistory,
  getMonthStart,
  getSalaryForMonth,
  recordSalaryChange,
};
