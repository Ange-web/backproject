const express = require("express");
const router = express.Router();
const { getPool } = require("./../db");
const verifyToken = require("./auth");

// Route pour enregistrer un scan
router.post("/track", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { tool_type, target, result_count } = req.body;

    // Validation
    if (!tool_type) {
      return res.status(400).json({ error: "tool_type est requis" });
    }

    // Vérifier que tool_type est valide
    const validTypes = ["url", "ip", "port", "exif"];
    if (!validTypes.includes(tool_type)) {
      return res.status(400).json({ error: "tool_type invalide. Valeurs acceptées: url, ip, port, exif" });
    }

    const pool = getPool();

    // Insérer l'enregistrement dans la table scans
    const result = await pool.query(
      `INSERT INTO scans (user_id, tool_type, target, result_count, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, user_id, tool_type, target, result_count, created_at`,
      [userId, tool_type, target || null, result_count || null]
    );

    res.status(201).json({
      message: "Scan enregistré avec succès",
      scan: result.rows[0]
    });
  } catch (error) {
    console.error("Erreur lors de l'enregistrement du scan :", error);
    res.status(500).json({ error: "Erreur serveur lors de l'enregistrement du scan" });
  }
});

// Route pour récupérer les statistiques
router.get("/", async (req, res) => {
  try {
    const pool = getPool();

    // Compter les scans par type
    const scansByType = await pool.query(
      `SELECT tool_type, COUNT(*) as count
       FROM scans
       GROUP BY tool_type
       ORDER BY tool_type`
    );

    // Calculer le total de scans
    const totalScans = await pool.query(
      `SELECT COUNT(*) as total FROM scans`
    );

    // Compter le nombre total d'utilisateurs
    const totalUsers = await pool.query(
      `SELECT COUNT(*) as total FROM public.user`
    );

    // Formater les résultats
    const stats = {
      total_scans: parseInt(totalScans.rows[0].total) || 0,
      total_users: parseInt(totalUsers.rows[0].total) || 0,
      scans_by_type: {
        url: 0,
        ip: 0,
        port: 0,
        exif: 0
      }
    };

    // Remplir les compteurs par type
    scansByType.rows.forEach((row) => {
      if (stats.scans_by_type.hasOwnProperty(row.tool_type)) {
        stats.scans_by_type[row.tool_type] = parseInt(row.count) || 0;
      }
    });

    res.json(stats);
  } catch (error) {
    console.error("Erreur lors de la récupération des statistiques :", error);
    res.status(500).json({ error: "Erreur serveur lors de la récupération des statistiques" });
  }
});

module.exports = router;

