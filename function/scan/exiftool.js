// function/scan/exiftool.js
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { exiftool } = require("exiftool-vendored");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/read", upload.single("image"), async (req, res) => {
  try {
    const metadata = await exiftool.read(req.file.path);
    res.json({ metadata, file: req.file.filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/edit", async (req, res) => {
  const { file, tag, value } = req.body;
  const path = `uploads/${file}`;

  try {
    await exiftool.write(path, { [tag]: value });
    res.json({ message: "Mise à jour réussie" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/delete", async (req, res) => {
  const { file } = req.body;
  const path = `uploads/${file}`;

  try {
    await exiftool.write(path, { All: "" }, ["-all="]);
    res.json({ message: "Métadonnées supprimées" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
