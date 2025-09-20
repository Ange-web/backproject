const express = require("express");
const cors = require("cors");
const app = express();
const PORT = 3000;

// Connexion à la base de données
const { getPool } = require("./db");
const pool = getPool();

// Importation des routes
const inscriptionroutes = require("./function/inscription");
const connexionroutes = require("./function/connexion");
const scanurl = require("./function/scan/scanurl");
const scanport = require("./function/scan/scanport");
const scanip = require("./function/scan/scanip");
const iaollama = require("./function/scan/iaollama");
const exifRoutes = require("./function/scan/exiftool");
const { getalluser } = require("./function/get_user");

// Middleware
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://projet-personnel-rust.vercel.app"
  ],
  methods: ["GET", "POST"],
  credentials: true
}));
app.use(express.json());



// Routes principales
app.get("/", getalluser);
app.use("/new", inscriptionroutes);
app.use("/user", connexionroutes);

// Routes de scan (bien séparées)
app.use("/scan/url", scanurl);
app.use("/scan/port", scanport);
app.use("/scan/ip", scanip);
app.use("/scan/ia", iaollama);
app.use("/scan/exif", exifRoutes);

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
});
