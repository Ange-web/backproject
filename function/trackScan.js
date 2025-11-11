// Fonction helper pour enregistrer un scan dans la base de données
const { getPool } = require("./../db");

async function trackScan(userId, toolType, target = null, resultCount = null) {
  try {
    const pool = getPool();
    
    await pool.query(
      `INSERT INTO scans (user_id, tool_type, target, result_count, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, toolType, target, resultCount]
    );
    
    console.log(`Scan enregistré: ${toolType} par utilisateur ${userId}`);
  } catch (error) {
    // On log l'erreur mais on ne bloque pas le processus principal
    console.error("Erreur lors de l'enregistrement du scan (non bloquant):", error);
  }
}

module.exports = trackScan;

