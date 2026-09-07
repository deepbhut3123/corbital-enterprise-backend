const Attendance = require("../models/Attendance");
const Holiday = require("../models/Holiday");
const Target = require("../models/Target");
const User = require("../models/User");
const ValueEntry = require("../models/ValueEntry");

const ATTENDANCE_TIMEZONE = "Asia/Kolkata";
const SALARY_DAY_MINUTES = 8 * 60;

const getValidatedMonthYear = (monthInput, yearInput) => {
  const month = Number(monthInput);
  const year = Number(yearInput);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    const error = new Error("month must be between 1 and 12.");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(year) || year < 2000) {
    const error = new Error("year must be a valid 4 digit year.");
    error.statusCode = 400;
    throw error;
  }

  return { month, year };
};

const getMonthRange = (month, year) => ({
  end: new Date(Date.UTC(year, month, 1)),
  start: new Date(Date.UTC(year, month - 1, 1)),
});

const formatDateKey = date => date.toISOString().slice(0, 10);

const getDatePartValue = (parts, type) =>
  Number(parts.find(part => part.type === type)?.value || 0);

const getIndiaDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ATTENDANCE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    day: getDatePartValue(parts, "day"),
    month: getDatePartValue(parts, "month"),
    year: getDatePartValue(parts, "year"),
  };
};

const formatTime = dateInput => {
  if (!dateInput) {
    return "-";
  }

  return new Date(dateInput).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ATTENDANCE_TIMEZONE,
  });
};

const formatDateLabel = dateInput =>
  new Date(`${dateInput}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });

const formatDuration = totalMinutes => {
  const minutes = Math.max(Math.round(totalMinutes || 0), 0);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (!hours) {
    return `${remainingMinutes}m`;
  }

  if (!remainingMinutes) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
};

const calculateTotalMinutes = logs => {
  const sortedLogs = [...logs].sort(
    (left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime()
  );
  const punchIn = sortedLogs.find(log => log.action === "check_in");
  const punchOut = [...sortedLogs]
    .reverse()
    .find(log => log.action === "check_out");

  if (!punchIn || !punchOut) {
    return 0;
  }

  const totalMilliseconds =
    new Date(punchOut.recordedAt).getTime() -
    new Date(punchIn.recordedAt).getTime();

  return Math.max(Math.round(totalMilliseconds / 60000), 0);
};

const getAttendanceTimes = logs => {
  const sortedLogs = [...logs].sort(
    (left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime()
  );
  const checkInLog = sortedLogs.find(log => log.action === "check_in");
  const checkOutLog = [...sortedLogs].reverse().find(log => log.action === "check_out");
  return {
    checkIn: formatTime(checkInLog?.recordedAt),
    checkOut: formatTime(checkOutLog?.recordedAt),
  };
};

const buildMonthDates = (month, year) => {
  const dates = [];
  const today = getIndiaDateParts();

  if (year > today.year || (year === today.year && month > today.month)) {
    return dates;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDay =
    year === today.year && month === today.month ? today.day : daysInMonth;

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day));
    dates.push({
      date,
      key: formatDateKey(date),
    });
  }

  return dates;
};

const isSundayDate = date => date.getUTCDay() === 0;

const buildSalaryReport = async ({ month: monthInput, userId, year: yearInput }) => {
  const { month, year } = getValidatedMonthYear(monthInput, yearInput);

  if (!userId) {
    const error = new Error("userId is required.");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findById(userId);

  if (!user) {
    const error = new Error("Selected user not found.");
    error.statusCode = 404;
    throw error;
  }

  const { start, end } = getMonthRange(month, year);
  const [attendances, holidays, target, valueEntries] = await Promise.all([
    Attendance.find({
      attendanceDate: {
        $gte: start,
        $lt: end,
      },
      userId,
    }),
    Holiday.find({
      holidayDate: {
        $gte: start,
        $lt: end,
      },
    }),
    Target.findOne({ month, userId, year }),
    ValueEntry.find({
      entryDate: {
        $gte: start,
        $lt: end,
      },
      userId,
    }).sort({ entryDate: 1, createdAt: 1 }),
  ]);

  const attendanceByDate = new Map(
    attendances.map(attendance => [formatDateKey(attendance.attendanceDate), attendance])
  );
  const holidayByDate = new Map(
    holidays.map(holiday => [formatDateKey(holiday.holidayDate), holiday])
  );
  const monthDates = buildMonthDates(month, year);
  const workingDays = monthDates.filter(
    ({ date, key }) => !isSundayDate(date) && !holidayByDate.has(key)
  ).length;
  const expectedWorkingMinutes = workingDays * SALARY_DAY_MINUTES;
  const hourlySalary = expectedWorkingMinutes
    ? user.fixedSalary / (expectedWorkingMinutes / 60)
    : 0;
  let presentDays = 0;
  let holidayDays = 0;
  let absentDays = 0;
  let totalWorkedMinutes = 0;
  let fixedPayable = 0;

  const attendanceRows = monthDates.map(({ key }) => {
    const attendance = attendanceByDate.get(key);
    const holiday = holidayByDate.get(key);
    const isSunday = isSundayDate(new Date(`${key}T00:00:00.000Z`));
    const logs = attendance?.logs || [];
    const workedMinutes = attendance?.totalMinutes || calculateTotalMinutes(logs);
    const hasAttendance = logs.length > 0;
    const status = hasAttendance ? "Present" : holiday || isSunday ? "Holiday" : "Absent";
    const statusLabel =
      status === "Holiday" ? holiday?.name || "Sunday" : status;
    const payableMinutes =
      status === "Holiday"
        ? SALARY_DAY_MINUTES
        : Math.min(workedMinutes, SALARY_DAY_MINUTES);
    const hourlyPayable = (payableMinutes / 60) * hourlySalary;
    const times = getAttendanceTimes(logs);

    if (status === "Present") {
      presentDays += 1;
    } else if (status === "Holiday") {
      holidayDays += 1;
    } else {
      absentDays += 1;
    }

    totalWorkedMinutes += workedMinutes;
    fixedPayable += hourlyPayable;

    return {
      checkIn: times.checkIn,
      checkOut: times.checkOut,
      date: key,
      dateLabel: formatDateLabel(key),
      holidayName: holiday?.name || (isSunday ? "Sunday" : ""),
      hourlyPayable,
      payableTime: formatDuration(payableMinutes),
      status,
      statusLabel,
      workedTime: formatDuration(workedMinutes),
    };
  });

  const addedValue = valueEntries.reduce(
    (total, entry) => total + Number(entry.sellAmount || 0),
    0
  );
  const targetAmount = target?.amount || 0;
  const targetAchievement = targetAmount ? Math.min(addedValue / targetAmount, 1) : 0;
  const variablePayable = user.variableSalary * targetAchievement;

  return {
    attendanceRows,
    employee: {
      email: user.email,
      fixedSalary: user.fixedSalary,
      id: user._id.toString(),
      phone: user.phone,
      roleId: user.roleId,
      username: user.username,
      variableSalary: user.variableSalary,
    },
    generatedAt: new Date(),
    month,
    salary: {
      absentDays,
      addedValue,
      fixedPayable,
      holidayDays,
      hourlySalary,
      payableDays: presentDays + holidayDays,
      presentDays,
      targetAchievement,
      targetAmount,
      totalPayable: fixedPayable + variablePayable,
      totalWorkedTime: formatDuration(totalWorkedMinutes),
      variablePayable,
      workingDays,
    },
    valueEntries: valueEntries.map(entry => ({
      date: formatDateKey(entry.entryDate),
      dateLabel: formatDateLabel(formatDateKey(entry.entryDate)),
      purchaseAmount: entry.purchaseAmount,
      sellAmount: entry.sellAmount,
    })),
    year,
  };
};

module.exports = {
  buildSalaryReport,
};
