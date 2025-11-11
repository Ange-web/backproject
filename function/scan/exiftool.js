// function/scan/exiftool.js
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { exiftool } = require("exiftool-vendored");
const verifyToken = require("../auth");
const trackScan = require("../trackScan");
const path = require("path");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/read", verifyToken, upload.single("image"), async (req, res) => {
  try {
    const userId = req.user.id;
    const metadata = await exiftool.read(req.file.path);
    
    // Enregistrer le scan dans la base de données
    const resultCount = Object.keys(metadata).length;
    const target = req.file.originalname || req.file.filename;
    await trackScan(userId, 'exif', target, resultCount);
    
    res.json({ metadata, file: req.file.filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/edit", verifyToken, async (req, res) => {
  const { file, tag, value } = req.body;
  const path = `uploads/${file}`;

  try {
    await exiftool.write(path, { [tag]: value });
    res.json({ message: "Mise à jour réussie" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/delete", verifyToken, async (req, res) => {
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

// Téléchargement sécurisé du fichier modifié
router.get("/download/:file", verifyToken, async (req, res) => {
  try {
    const { file } = req.params;
    // Validation stricte du nom de fichier (évite ../ et caractères spéciaux)
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(file)) {
      return res.status(400).json({ error: "Nom de fichier invalide" });
    }

    const uploadDir = path.resolve(process.cwd(), "uploads");
    const fullPath = path.normalize(path.join(uploadDir, file));
    if (!fullPath.startsWith(uploadDir)) {
      return res.status(400).json({ error: "Chemin non autorisé" });
    }
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "Fichier introuvable" });
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
    return res.sendFile(fullPath);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
