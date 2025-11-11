const express = require("express");
const cors = require("cors");
const app = express();
const PORT = 3000;

// ⚠️ Configuration trust proxy - ICI, avant tout le reste
app.set('trust proxy', true); // 1 si Nginx est le seul proxy devant, sinon true

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
const statsRoutes = require("./function/stats");
const { getalluser } = require("./function/get_user");

// Middleware
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://projet-personnel-rust.vercel.app",
    "https://n8nange.site"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));
app.use(express.json());

/* ===================== ADD: Préflight CORS universel ===================== */
const _allowlist = new Set([
  "http://localhost:5173",
  "https://projet-personnel-rust.vercel.app",
  "https://n8nange.site",
  "https://www.n8nange.site", // pour couvrir le sous-domaine en préflight
]);
const _corsOptions = {
  origin: (origin, cb) => cb(null, !origin || _allowlist.has(origin)),
  credentials: true,
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-Requested-With"],
};
app.options(/.*/, cors(_corsOptions));
/* ======================================================================== */

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

// Routes de statistiques
app.use("/stats", statsRoutes);

/* ===================== ADD: Debug IP & Healthcheck ====================== */
app.get("/debug/ip", (req, res) => {
  res.json({
    ip: req.ip,
    xff: req.headers["x-forwarded-for"] || null,
    xreal: req.headers["x-real-ip"] || null,
    proto: req.headers["x-forwarded-proto"] || null,
  });
});

app.get("/healthz", (req, res) => res.status(200).send("ok"));
/* ======================================================================== */

/* ===================== ADD: Simple reverse proxy to n8n ================= */
// Route proxy pour contourner le CORS côté navigateur.
// Utilisation: le frontend appelle notre serveur sur /proxy/... au lieu de https://n8nange.site/...
// Exemple: POST /proxy/user/login -> forward vers https://n8nange.site/user/login
app.all(/^\/proxy\/.*$/, async (req, res) => {
  try {
    const originalUrl = req.originalUrl || req.url;
    const pathAfterProxy = originalUrl.replace(/^\/proxy/, "");

    const targetUrl = `https://n8nange.site${pathAfterProxy}`;

    // Reconstituer le corps pour les méthodes avec payload
    const hasBody = !["GET", "HEAD"].includes(req.method);
    const contentType = req.get("content-type") || "application/json";
    const requestBody = hasBody ? (contentType.includes("application/json") ? JSON.stringify(req.body || {}) : req.body) : undefined;

    // Transférer quelques en-têtes utiles sans propager les en-têtes sensibles de CORS
    const forwardHeaders = {
      "content-type": contentType,
    };
    const authHeader = req.get("authorization");
    if (authHeader) forwardHeaders["authorization"] = authHeader;

    // Node 18+ : fetch global. Si non dispo, il faudra installer node-fetch.
    const fetchFn = global.fetch;
    if (typeof fetchFn !== "function") {
      return res.status(500).json({ error: "fetch non disponible côté serveur" });
    }

    const upstreamResponse = await fetchFn(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: requestBody,
      redirect: "manual",
    });

    // Répercuter le statut et les en-têtes (en filtrant les CORS upstream)
    res.status(upstreamResponse.status);
    upstreamResponse.headers.forEach((value, key) => {
      const lower = String(key).toLowerCase();
      if (lower.startsWith("access-control-")) return; // on laisse notre middleware CORS gérer ça
      if (lower === "content-encoding") return; // éviter les incohérences d'encodage
      res.setHeader(key, value);
    });

    // Gérer 204 No Content proprement
    if (upstreamResponse.status === 204) {
      return res.end();
    }

    const buffer = Buffer.from(await upstreamResponse.arrayBuffer());
    return res.send(buffer);
  } catch (error) {
    console.error("Proxy error:", error);
    return res.status(502).json({ error: "Bad Gateway", detail: "Proxy vers n8n échoué" });
  }
});
/* ======================================================================== */

/* ===================== ADD: 404 & Error handlers ======================== */
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({ error: "Internal Server Error" });
});
/* ======================================================================== */

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
});
