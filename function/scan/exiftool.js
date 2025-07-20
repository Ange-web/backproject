const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const { exiftool } = require("exiftool-vendored");

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("uploads"));

const upload = multer({ dest: "uploads/" });

// Lire les métadonnées
app.post("/read", upload.single("image"), async (req, res) => {
  try {
    const metadata = await exiftool.read(req.file.path);
    res.json({ metadata, file: req.file.filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Modifier les métadonnées
app.post("/edit", async (req, res) => {
  const { file, tag, value } = req.body;
  const path = `uploads/${file}`;

  try {
    await exiftool.write(path, { [tag]: value });
    res.json({ message: "Mise à jour réussie" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Supprimer les métadonnées
app.post("/delete", async (req, res) => {
  const { file } = req.body;
  const path = `uploads/${file}`;

  try {
    await exiftool.write(path, { All: "" }, ["-all="]);
    res.json({ message: "Métadonnées supprimées" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Serveur actif sur http://localhost:${port}`);
});
