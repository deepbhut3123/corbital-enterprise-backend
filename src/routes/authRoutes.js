const express = require("express");

const {
  createUser,
  deleteUser,
  getCurrentUser,
  getUsers,
  loginUser,
  updateUser,
} = require("../controllers/authController");
const { decodeOptionalAuth, requireAdmin, requireAuth } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/me", requireAuth, getCurrentUser);
router.get("/users", requireAuth, requireAdmin, getUsers);
router.put("/users/:id", requireAuth, requireAdmin, updateUser);
router.delete("/users/:id", requireAuth, requireAdmin, deleteUser);
router.post("/register", decodeOptionalAuth, createUser);
router.post("/login", loginUser);

module.exports = router;
