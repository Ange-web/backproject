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
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier fourni" });
    }

    const userId = req.user.id;
    
    // Vérifier que le fichier existe bien après l'upload
    if (!fs.existsSync(req.file.path)) {
      return res.status(500).json({ error: "Erreur lors de l'enregistrement du fichier" });
    }

    const metadata = await exiftool.read(req.file.path);
    
    // Enregistrer le scan dans la base de données
    const resultCount = Object.keys(metadata).length;
    const target = req.file.originalname || req.file.filename;
    await trackScan(userId, 'exif', target, resultCount);
    
    // Retourner les métadonnées et le nom du fichier sauvegardé
    res.json({ 
      metadata, 
      file: req.file.filename,
      originalName: req.file.originalname,
      saved: true,
      ready: true
    });
  } catch (err) {
    console.error("Erreur lors de la lecture des métadonnées:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/edit", verifyToken, async (req, res) => {
  const { file, tag, value } = req.body;
  
  if (!file || !tag) {
    return res.status(400).json({ error: "Fichier et tag requis" });
  }

  // Validation stricte du nom de fichier
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(file)) {
    return res.status(400).json({ error: "Nom de fichier invalide" });
  }

  const uploadDir = path.resolve(process.cwd(), "uploads");
  const fullPath = path.normalize(path.join(uploadDir, file));
  
  // Vérification de sécurité du chemin
  if (!fullPath.startsWith(uploadDir)) {
    return res.status(400).json({ error: "Chemin non autorisé" });
  }

  // Vérifier que le fichier existe
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: "Fichier introuvable" });
  }

  try {
    await exiftool.write(fullPath, { [tag]: value });
    res.json({ 
      message: "Mise à jour réussie",
      file: file,
      ready: true
    });
  } catch (err) {
    console.error("Erreur lors de la modification des métadonnées:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/delete", verifyToken, async (req, res) => {
  const { file } = req.body;
  
  if (!file) {
    return res.status(400).json({ error: "Nom de fichier requis" });
  }

  // Validation stricte du nom de fichier
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(file)) {
    return res.status(400).json({ error: "Nom de fichier invalide" });
  }

  const uploadDir = path.resolve(process.cwd(), "uploads");
  const fullPath = path.normalize(path.join(uploadDir, file));
  
  // Vérification de sécurité du chemin
  if (!fullPath.startsWith(uploadDir)) {
    return res.status(400).json({ error: "Chemin non autorisé" });
  }

  // Vérifier que le fichier existe avant de supprimer les métadonnées
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: "Fichier introuvable" });
  }

  try {
    // Supprimer toutes les métadonnées EXIF
    await exiftool.write(fullPath, { All: "" }, ["-all="]);
    
    // Vérifier que le fichier existe toujours après la modification
    if (!fs.existsSync(fullPath)) {
      return res.status(500).json({ error: "Le fichier a été supprimé lors de la modification" });
    }

    // Retourner le nom du fichier pour permettre le téléchargement
    res.json({ 
      message: "Métadonnées supprimées avec succès",
      file: file,
      ready: true
    });
  } catch (err) {
    console.error("Erreur lors de la suppression des métadonnées:", err);
    res.status(500).json({ error: err.message });
  }
});

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

    // Déterminer le type MIME basé sur l'extension
    const ext = path.extname(file).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.tiff': 'image/tiff',
      '.webp': 'image/webp'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
    return res.sendFile(fullPath);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
