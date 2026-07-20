const mongoose = require("mongoose");

const Attendance = require("../models/Attendance");
const Holiday = require("../models/Holiday");
const User = require("../models/User");

const ADMIN_ROLE_VALUES = ["1", "admin"];
const ATTENDANCE_ACTIONS = ["check_in", "break_start", "break_end", "check_out"];
const ATTENDANCE_TIMEZONE = "Asia/Kolkata";
const FULL_DAY_MINUTES = 510;
const HALF_DAY_MINUTES = 255;

const rawOfficeLatitude = (process.env.ATTENDANCE_LATITUDE || "").trim();
const rawOfficeLongitude = (process.env.ATTENDANCE_LONGITUDE || "").trim();
const rawOfficeRadius = (process.env.ATTENDANCE_RADIUS_METERS || "").trim();
const rawOfficeLocationName = (process.env.ATTENDANCE_LOCATION_NAME || "").trim();

const officeLatitude = Number(rawOfficeLatitude);
const officeLongitude = Number(rawOfficeLongitude);
const officeRadiusMeters = Number(rawOfficeRadius || 50);
const officeLocationName = rawOfficeLocationName || "Office Location";

const isAdminRole = roleId =>
  ADMIN_ROLE_VALUES.includes(String(roleId || "").trim().toLowerCase());

const isOfficeConfigured = () =>
  Number.isFinite(officeLatitude) && Number.isFinite(officeLongitude);

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

const getAttendanceDate = (year, month, day) =>
  new Date(Date.UTC(year, month - 1, day));

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

const formatDateKey = date => new Date(date).toISOString().slice(0, 10);

const isSundayDate = date => new Date(date).getUTCDay() === 0;

const getDistanceInMeters = (
  latitudeA,
  longitudeA,
  latitudeB,
  longitudeB
) => {
  const earthRadius = 6371000;
  const latitudeDelta = ((latitudeB - latitudeA) * Math.PI) / 180;
  const longitudeDelta = ((longitudeB - longitudeA) * Math.PI) / 180;
  const latitudeARadians = (latitudeA * Math.PI) / 180;
  const latitudeBRadians = (latitudeB * Math.PI) / 180;

  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(latitudeARadians) *
      Math.cos(latitudeBRadians) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const formatDistanceLabel = distanceMeters => {
  if (!Number.isFinite(distanceMeters)) {
    return "0 m";
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(distanceMeters >= 10000 ? 0 : 2)} km`;
};

const getAllowedNextActions = logs => {
  if (!logs.length) {
    return ["check_in"];
  }

  const lastAction = logs[logs.length - 1].action;

  switch (lastAction) {
    case "check_in":
      return ["break_start", "check_out"];
    case "break_start":
      return ["break_end"];
    case "break_end":
      return ["break_start", "check_out"];
    case "check_out":
      return [];
    default:
      return [];
  }
};

const getActionErrorMessage = (action, logs) => {
  if (!logs.length) {
    return action === "check_in"
      ? null
      : "First attendance action of the day must be Check In.";
  }

  const lastAction = logs[logs.length - 1].action;

  if (lastAction === "check_out") {
    return "Attendance for today is already closed after Check Out.";
  }

  if (lastAction === "check_in") {
    return "After Check In, only Break Start or Check Out is allowed.";
  }

  if (lastAction === "break_start") {
    return "After Break Start, only Break End is allowed.";
  }

  if (lastAction === "break_end") {
    return "After Break End, only Break Start or Check Out is allowed.";
  }

  return `Action ${action} is not allowed right now.`;
};

const calculateTotalMinutes = logs => {
  const sortedLogs = [...logs].sort(
    (left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime()
  );

  let activeStartTime = null;
  let totalMilliseconds = 0;

  sortedLogs.forEach(log => {
    const logTime = new Date(log.recordedAt).getTime();

    if (log.action === "check_in" || log.action === "break_end") {
      activeStartTime = logTime;
      return;
    }

    if ((log.action === "break_start" || log.action === "check_out") && activeStartTime) {
      totalMilliseconds += Math.max(logTime - activeStartTime, 0);
      activeStartTime = null;
    }
  });

  return Math.max(Math.round(totalMilliseconds / 60000), 0);
};

const getAttendanceStatus = ({ attendanceDate, holiday, logs, totalMinutes }) => {
  if (holiday) {
    return {
      status: "holiday",
      statusLabel: holiday.name || "Holiday",
    };
  }

  if (isSundayDate(attendanceDate)) {
    return {
      status: "sunday",
      statusLabel: "Sunday",
    };
  }

  if (!logs.length) {
    return {
      status: "absent",
      statusLabel: "Absent",
    };
  }

  if (totalMinutes >= FULL_DAY_MINUTES) {
    return {
      status: "present",
      statusLabel: "Present",
    };
  }

  if (totalMinutes >= HALF_DAY_MINUTES) {
    return {
      status: "half_day",
      statusLabel: "Half Day",
    };
  }

  return {
    status: "absent",
    statusLabel: "Absent",
  };
};

const formatAttendanceResponse = (attendance, holiday = null) => {
  const logs = [...(attendance.logs || [])]
    .sort(
      (left, right) =>
        new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime()
    )
    .map(log => ({
      action: log.action,
      address: log.address || null,
      distanceMeters:
        typeof log.distanceMeters === "number" ? Number(log.distanceMeters) : null,
      id: log._id.toString(),
      latitude: typeof log.latitude === "number" ? log.latitude : null,
      longitude: typeof log.longitude === "number" ? log.longitude : null,
      notes: log.notes || null,
      recordedAt: log.recordedAt,
    }));
  const totalMinutes = attendance.totalMinutes || 0;
  const { status, statusLabel } = getAttendanceStatus({
    attendanceDate: attendance.attendanceDate,
    holiday,
    logs,
    totalMinutes,
  });

  return {
    attendanceDate: formatDateKey(attendance.attendanceDate),
    createdAt: attendance.createdAt,
    id: attendance._id.toString(),
    logs,
    status,
    statusLabel,
    totalMinutes,
    userEmail: attendance.userId?.email || "",
    userId: attendance.userId?._id
      ? attendance.userId._id.toString()
      : attendance.userId.toString(),
    username: attendance.userId?.username || "",
  };
};

const formatSyntheticAttendanceResponse = ({ attendanceDate, holiday, user }) => {
  const { status, statusLabel } = getAttendanceStatus({
    attendanceDate,
    holiday,
    logs: [],
    totalMinutes: 0,
  });

  return {
    attendanceDate: formatDateKey(attendanceDate),
    createdAt: null,
    id: `${user._id.toString()}-${formatDateKey(attendanceDate)}`,
    logs: [],
    status,
    statusLabel,
    totalMinutes: 0,
    userEmail: user.email || "",
    userId: user._id.toString(),
    username: user.username || "",
  };
};

const buildMonthDates = (month, year) => {
  const today = getIndiaDateParts();

  if (year > today.year || (year === today.year && month > today.month)) {
    return [];
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDay =
    year === today.year && month === today.month ? today.day : daysInMonth;

  return Array.from(
    { length: lastDay },
    (_, index) => new Date(Date.UTC(year, month - 1, index + 1))
  );
};

const buildAttendanceListResponse = ({ holidays, month, records, users, year }) => {
  const holidayByDate = new Map(
    holidays.map(holiday => [formatDateKey(holiday.holidayDate), holiday])
  );
  const recordByUserDate = new Map(
    records.map(record => [
      `${record.userId?._id ? record.userId._id.toString() : record.userId.toString()}-${formatDateKey(record.attendanceDate)}`,
      record,
    ])
  );
  const responses = [];

  users.forEach(user => {
    buildMonthDates(month, year).forEach(attendanceDate => {
      const dateKey = formatDateKey(attendanceDate);
      const recordKey = `${user._id.toString()}-${dateKey}`;
      const record = recordByUserDate.get(recordKey);
      const holiday = holidayByDate.get(dateKey) || null;

      responses.push(
        record
          ? formatAttendanceResponse(record, holiday)
          : formatSyntheticAttendanceResponse({ attendanceDate, holiday, user })
      );
    });
  });

  return responses.sort((left, right) => {
    const dateCompare = right.attendanceDate.localeCompare(left.attendanceDate);

    if (dateCompare !== 0) {
      return dateCompare;
    }

    return left.username.localeCompare(right.username);
  });
};

const populateAttendance = query =>
  query.populate("userId", "username email");

const createAttendanceAction = async (req, res, next) => {
  try {
    const { action, latitude, longitude } = req.body;

    if (!ATTENDANCE_ACTIONS.includes(String(action || "").trim())) {
      const error = new Error("action must be one of check_in, break_start, break_end, or check_out.");
      error.statusCode = 400;
      throw error;
    }

    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);

    if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
      const error = new Error("latitude and longitude are required.");
      error.statusCode = 400;
      throw error;
    }

    if (!isOfficeConfigured()) {
      const error = new Error("Attendance office location is not configured on the server.");
      error.statusCode = 500;
      throw error;
    }

    const distanceMeters = getDistanceInMeters(
      parsedLatitude,
      parsedLongitude,
      officeLatitude,
      officeLongitude
    );

    if (distanceMeters > officeRadiusMeters) {
      const error = new Error(
        `You must be within ${officeRadiusMeters}m of ${officeLocationName} to mark attendance. Current distance is ${formatDistanceLabel(distanceMeters)}.`
      );
      error.statusCode = 403;
      throw error;
    }

    const currentTimestamp = new Date();
    const { day, month, year } = getIndiaDateParts(currentTimestamp);
    const attendanceDate = getAttendanceDate(year, month, day);

    const existingRecord = await Attendance.findOne({
      attendanceDate,
      userId: req.auth.userId,
    });

    const logs = existingRecord ? [...existingRecord.logs] : [];
    const allowedActions = getAllowedNextActions(logs);

    if (!allowedActions.includes(action)) {
      const error = new Error(getActionErrorMessage(action, logs));
      error.statusCode = 400;
      throw error;
    }

    const nextLogs = [
      ...logs,
      {
        action,
        distanceMeters,
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        recordedAt: currentTimestamp,
      },
    ];

    let savedRecord;

    if (existingRecord) {
      existingRecord.logs = nextLogs;
      existingRecord.totalMinutes = calculateTotalMinutes(nextLogs);
      savedRecord = await existingRecord.save();
    } else {
      savedRecord = await Attendance.create({
        attendanceDate,
        logs: nextLogs,
        totalMinutes: calculateTotalMinutes(nextLogs),
        userId: req.auth.userId,
      });
    }

    const populatedRecord = await populateAttendance(Attendance.findById(savedRecord._id));

    res.status(201).json({
      success: true,
      message: "Attendance action saved successfully.",
      data: formatAttendanceResponse(populatedRecord),
    });
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) {
      error.statusCode = 400;
      error.message = "Invalid attendance request.";
    }

    next(error);
  }
};

const getAttendanceRecords = async (req, res, next) => {
  try {
    const now = getIndiaDateParts();
    const { month, year } = getValidatedMonthYear(
      req.query.month || now.month,
      req.query.year || now.year
    );
    const { start, end } = getMonthRange(month, year);
    const selectedUserId = (req.query.userId || "").trim();
    const query = {
      attendanceDate: {
        $gte: start,
        $lt: end,
      },
    };
    const userQuery = {};

    if (selectedUserId) {
      if (!mongoose.Types.ObjectId.isValid(selectedUserId)) {
        const error = new Error("userId must be a valid user id.");
        error.statusCode = 400;
        throw error;
      }

      const user = await User.findById(selectedUserId);

      if (!user) {
        const error = new Error("Selected user not found.");
        error.statusCode = 404;
        throw error;
      }

      query.userId = selectedUserId;
      userQuery._id = selectedUserId;
    }

    const [records, holidays, users] = await Promise.all([
      populateAttendance(Attendance.find(query).sort({ attendanceDate: -1, createdAt: -1 })),
      Holiday.find({
        holidayDate: {
          $gte: start,
          $lt: end,
        },
      }),
      User.find(userQuery).sort({ username: 1 }),
    ]);

    res.status(200).json({
      success: true,
      message: "Attendance records fetched successfully.",
      data: buildAttendanceListResponse({ holidays, month, records, users, year }),
    });
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) {
      error.statusCode = 400;
      error.message = "Invalid attendance filter.";
    }

    next(error);
  }
};

const getMyAttendanceRecords = async (req, res, next) => {
  try {
    const now = getIndiaDateParts();
    const { month, year } = getValidatedMonthYear(
      req.query.month || now.month,
      req.query.year || now.year
    );
    const { start, end } = getMonthRange(month, year);

    const [records, holidays, users] = await Promise.all([
      populateAttendance(Attendance.find({
        attendanceDate: {
          $gte: start,
          $lt: end,
        },
        userId: req.auth.userId,
      }).sort({ attendanceDate: -1, createdAt: -1 })),
      Holiday.find({
        holidayDate: {
          $gte: start,
          $lt: end,
        },
      }),
      User.find({ _id: req.auth.userId }),
    ]);

    res.status(200).json({
      success: true,
      message: "Attendance records fetched successfully.",
      data: buildAttendanceListResponse({ holidays, month, records, users, year }),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAttendanceAction,
  getAttendanceRecords,
  getMyAttendanceRecords,
};
