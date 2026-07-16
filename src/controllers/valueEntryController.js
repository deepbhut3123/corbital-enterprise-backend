const User = require("../models/User");
const ValueEntry = require("../models/ValueEntry");

const ADMIN_ROLE_VALUES = ["1", "admin"];

const isAdminRole = roleId =>
  ADMIN_ROLE_VALUES.includes(String(roleId || "").trim().toLowerCase());

const parseEntryDate = entryDateInput => {
  if (!entryDateInput) {
    const error = new Error("entryDate is required.");
    error.statusCode = 400;
    throw error;
  }

  const normalizedDate = new Date(`${entryDateInput}T00:00:00.000Z`);

  if (Number.isNaN(normalizedDate.getTime())) {
    const error = new Error("entryDate must be a valid date.");
    error.statusCode = 400;
    throw error;
  }

  return normalizedDate;
};

const parseAmount = (value, fieldLabel) => {
  const parsedValue = Number(value);

  if (Number.isNaN(parsedValue) || parsedValue < 0) {
    const error = new Error(`${fieldLabel} must be a valid positive number.`);
    error.statusCode = 400;
    throw error;
  }

  return parsedValue;
};

const formatValueEntryResponse = entry => ({
  createdAt: entry.createdAt,
  createdById: entry.createdBy?._id
    ? entry.createdBy._id.toString()
    : entry.createdBy.toString(),
  createdByName: entry.createdBy?.username || null,
  entryDate: new Date(entry.entryDate).toISOString().slice(0, 10),
  id: entry._id.toString(),
  netProfit: entry.sellAmount - entry.purchaseAmount,
  purchaseAmount: entry.purchaseAmount,
  sellAmount: entry.sellAmount,
  userEmail: entry.userId?.email || "",
  userId: entry.userId?._id ? entry.userId._id.toString() : entry.userId.toString(),
  username: entry.userId?.username || "",
});

const populateValueEntry = query =>
  query
    .populate("userId", "username email")
    .populate("createdBy", "username");

const createValueEntry = async (req, res, next) => {
  try {
    const {
      entryDate: entryDateInput,
      purchaseAmount,
      sellAmount,
      userId: selectedUserId,
    } = req.body;
    const requesterRoleId = String(req.auth?.roleId || "").trim().toLowerCase();
    const isAdmin = isAdminRole(requesterRoleId);
    const userId = isAdmin ? selectedUserId : req.auth.userId;

    if (!userId) {
      const error = new Error("userId is required.");
      error.statusCode = 400;
      throw error;
    }

    const entryDate = parseEntryDate(entryDateInput);
    const parsedPurchaseAmount = parseAmount(purchaseAmount, "purchaseAmount");
    const parsedSellAmount = parseAmount(sellAmount, "sellAmount");

    const user = await User.findById(userId);

    if (!user) {
      const error = new Error("Selected user not found.");
      error.statusCode = 404;
      throw error;
    }

    const savedEntry = await ValueEntry.create({
      createdBy: req.auth.userId,
      entryDate,
      purchaseAmount: parsedPurchaseAmount,
      sellAmount: parsedSellAmount,
      userId,
    });

    const populatedEntry = await populateValueEntry(
      ValueEntry.findById(savedEntry._id)
    );

    res.status(201).json({
      success: true,
      message: "Value entry created successfully.",
      data: formatValueEntryResponse(populatedEntry),
    });
  } catch (error) {
    next(error);
  }
};

const getValueEntries = async (req, res, next) => {
  try {
    const requesterRoleId = String(req.auth?.roleId || "").trim().toLowerCase();
    const isAdmin = isAdminRole(requesterRoleId);
    const query = isAdmin ? {} : { userId: req.auth.userId };

    const entries = await populateValueEntry(
      ValueEntry.find(query).sort({ entryDate: -1, createdAt: -1 })
    );

    res.status(200).json({
      success: true,
      message: "Value entries fetched successfully.",
      data: entries.map(formatValueEntryResponse),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createValueEntry,
  getValueEntries,
};
