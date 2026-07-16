const User = require("../models/User");
const { signAuthToken } = require("../utils/jwt");
const { verifyTotpToken } = require("../utils/totp");

const ADMIN_ROLE_VALUES = ["1", "admin"];
const SHARED_AUTHENTICATOR_SECRET = String(
  process.env.AUTHENTICATOR_SHARED_SECRET || ""
).trim();

const isAdminRole = (roleId) =>
  ADMIN_ROLE_VALUES.includes(String(roleId || "").trim().toLowerCase());

const formatUserResponse = (user) => ({
  id: user._id.toString(),
  username: user.username,
  email: user.email,
  phone: user.phone,
  fixedSalary: user.fixedSalary,
  variableSalary: user.variableSalary,
  roleId: user.roleId,
  authenticatorEnabled: !isAdminRole(user.roleId) && Boolean(SHARED_AUTHENTICATOR_SECRET),
});

const buildAuthResponse = (user) => ({
  token: signAuthToken({
    email: user.email,
    roleId: user.roleId,
    userId: user._id.toString(),
  }),
  tokenExpiresIn: (process.env.JWT_EXPIRES_IN || "").trim() || null,
  user: formatUserResponse(user),
});

const buildTwoFactorChallenge = (user) => ({
  requiresTwoFactor: true,
  user: formatUserResponse(user),
});

const countAdmins = () =>
  User.find({
    roleId: {
      $in: ADMIN_ROLE_VALUES,
    },
  }).countDocuments();

const createUser = async (req, res, next) => {
  try {
    const {
      username,
      email,
      phone,
      password,
      fixedSalary = 0,
      variableSalary = 0,
      roleId,
    } = req.body;

    if (!username || !email || !phone || !password || !roleId) {
      const error = new Error(
        "username, email, phone, password, and roleId are required."
      );
      error.statusCode = 400;
      throw error;
    }

    const totalUsers = await User.countDocuments();

    if (totalUsers > 0) {
      const requesterRoleId = String(req.auth?.roleId || "").trim().toLowerCase();

      if (!isAdminRole(requesterRoleId)) {
        const error = new Error("Only admin can create users.");
        error.statusCode = 403;
        throw error;
      }
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });

    if (existingUser) {
      const error = new Error("A user with this email already exists.");
      error.statusCode = 409;
      throw error;
    }

    const user = await User.create({
      username,
      email,
      phone,
      password,
      fixedSalary,
      variableSalary,
      roleId,
      authenticatorEnabled: false,
      authenticatorSecret: null,
    });

    res.status(201).json({
      success: true,
      message: "User created successfully.",
      data: formatUserResponse(user),
    });
  } catch (error) {
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { email, password, otp } = req.body;

    if (!email || !password) {
      const error = new Error("email and password are required.");
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password"
    );

    if (!user) {
      const error = new Error("Invalid email or password.");
      error.statusCode = 401;
      throw error;
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      const error = new Error("Invalid email or password.");
      error.statusCode = 401;
      throw error;
    }

    const shouldRequireAuthenticator =
      !isAdminRole(user.roleId) && Boolean(SHARED_AUTHENTICATOR_SECRET);

    if (shouldRequireAuthenticator) {
      if (!String(otp || "").trim()) {
        return res.status(200).json({
          success: true,
          message: "Authenticator code required.",
          data: buildTwoFactorChallenge(user),
        });
      }

      const isOtpValid = verifyTotpToken(otp, SHARED_AUTHENTICATOR_SECRET);

      if (!isOtpValid) {
        const error = new Error("Invalid authenticator code.");
        error.statusCode = 401;
        throw error;
      }
    }

    res.status(200).json({
      success: true,
      message: "Login successful.",
      data: buildAuthResponse(user),
    });
  } catch (error) {
    next(error);
  }
};

const getUsers = async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Users fetched successfully.",
      data: users.map(formatUserResponse),
    });
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      username,
      email,
      phone,
      password,
      fixedSalary = 0,
      variableSalary = 0,
      roleId,
    } = req.body;

    if (!username || !email || !phone || !roleId) {
      const error = new Error(
        "username, email, phone, and roleId are required."
      );
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findById(id);

    if (!user) {
      const error = new Error("User not found.");
      error.statusCode = 404;
      throw error;
    }

    const existingUser = await User.findOne({
      email: email.toLowerCase(),
      _id: { $ne: id },
    });

    if (existingUser) {
      const error = new Error("A user with this email already exists.");
      error.statusCode = 409;
      throw error;
    }

    if (isAdminRole(user.roleId) && !isAdminRole(roleId)) {
      const adminCount = await countAdmins();

      if (adminCount < 2) {
        const error = new Error(
          "Keep at least two admins before removing admin access."
        );
        error.statusCode = 400;
        throw error;
      }
    }

    user.username = username;
    user.email = email.toLowerCase();
    user.phone = phone;
    user.fixedSalary = fixedSalary;
    user.variableSalary = variableSalary;
    user.roleId = roleId;

    if (String(password || "").trim()) {
      user.password = password;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "User updated successfully.",
      data: formatUserResponse(user),
    });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      const error = new Error("User not found.");
      error.statusCode = 404;
      throw error;
    }

    if (isAdminRole(user.roleId)) {
      const adminCount = await countAdmins();

      if (adminCount < 2) {
        const error = new Error(
          "Keep at least two admins before deleting an admin user."
        );
        error.statusCode = 400;
        throw error;
      }
    }

    await User.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "User deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createUser,
  deleteUser,
  getUsers,
  loginUser,
  updateUser,
};
