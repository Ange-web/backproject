// routes/upload.js
const express = require("express");
const multer = require("multer");
const { storage } = require("../config/cloudinary");
const pool = require("../db");

const upload = multer({ storage });
const router = express.Router();

router.post("/upload", upload.single("avatar"), async (req, res) => {
  const { userId } = req.body;
  const imageUrl = req.file.path;

  // Enregistrement dans la base
  await pool.query(
    "UPDATE users SET avatar_url = $1 WHERE id = $2",
    [imageUrl, userId]
  );

  res.json({ avatarUrl: imageUrl });
});

module.exports = router;
