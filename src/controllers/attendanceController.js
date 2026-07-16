const mongoose = require("mongoose");

const Attendance = require("../models/Attendance");
const User = require("../models/User");

const ADMIN_ROLE_VALUES = ["1", "admin"];
const ATTENDANCE_ACTIONS = ["check_in", "break_start", "break_end", "check_out"];
const ATTENDANCE_TIMEZONE = "Asia/Kolkata";

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

const formatAttendanceResponse = attendance => ({
  attendanceDate: new Date(attendance.attendanceDate).toISOString().slice(0, 10),
  createdAt: attendance.createdAt,
  id: attendance._id.toString(),
  logs: [...(attendance.logs || [])]
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
    })),
  totalMinutes: attendance.totalMinutes,
  userEmail: attendance.userId?.email || "",
  userId: attendance.userId?._id
    ? attendance.userId._id.toString()
    : attendance.userId.toString(),
  username: attendance.userId?.username || "",
});

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
    }

    const records = await populateAttendance(
      Attendance.find(query).sort({ attendanceDate: -1, createdAt: -1 })
    );

    res.status(200).json({
      success: true,
      message: "Attendance records fetched successfully.",
      data: records.map(formatAttendanceResponse),
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

    const records = await populateAttendance(
      Attendance.find({
        attendanceDate: {
          $gte: start,
          $lt: end,
        },
        userId: req.auth.userId,
      }).sort({ attendanceDate: -1, createdAt: -1 })
    );

    res.status(200).json({
      success: true,
      message: "Attendance records fetched successfully.",
      data: records.map(formatAttendanceResponse),
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
