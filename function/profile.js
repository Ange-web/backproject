const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getPool, getJwtSecret } = require("./../db");
const verifyToken = require("./auth");
require("dotenv").config();

const router = express.Router();
const defaultAvatar = "https://www.flaticon.com/svg/static/icons/svg/6809/6809608.svg";

// GET /profile - Récupérer le profil de l'utilisateur connecté
router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = getPool();

    const result = await pool.query(
      "SELECT id, email, username, nom, prenom, avatar_url FROM public.user WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    const user = result.rows[0];
    const userResponse = {
      id: user.id,
      username: user.username,
      email: user.email,
      nom: user.nom || null,
      prenom: user.prenom || null,
      avatar_url: user.avatar_url || defaultAvatar,
    };

    res.json(userResponse);
  } catch (error) {
    console.error("Erreur lors de la récupération du profil :", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// PUT /profile - Modifier le profil (username, email, nom, prenom, avatar_url)
router.put("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, email, nom, prenom, avatar_url } = req.body;
    const pool = getPool();

    // Vérifier que l'utilisateur existe
    const userCheck = await pool.query("SELECT id, email FROM public.user WHERE id = $1", [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // Vérifier si l'email est déjà utilisé par un autre utilisateur
    if (email && email !== userCheck.rows[0].email) {
      const emailCheck = await pool.query("SELECT id FROM public.user WHERE email = $1 AND id != $2", [email, userId]);
      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ message: "Cet email est déjà utilisé" });
      }
    }

    // Construire la requête de mise à jour dynamiquement
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (username !== undefined) {
      updates.push(`username = $${paramIndex++}`);
      values.push(username);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email);
    }
    if (nom !== undefined) {
      updates.push(`nom = $${paramIndex++}`);
      values.push(nom);
    }
    if (prenom !== undefined) {
      updates.push(`prenom = $${paramIndex++}`);
      values.push(prenom);
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(avatar_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "Aucune donnée à modifier" });
    }

    values.push(userId);
    const query = `UPDATE public.user SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING id, email, username, nom, prenom, avatar_url`;

    const result = await pool.query(query, values);
    const updatedUser = result.rows[0];

    // Générer un nouveau token avec les informations mises à jour
    const jwtSecret = getJwtSecret();
    const newToken = jwt.sign(
      {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        nom: updatedUser.nom,
        prenom: updatedUser.prenom,
      },
      jwtSecret,
      { expiresIn: "1h" }
    );

    const userResponse = {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      nom: updatedUser.nom || null,
      prenom: updatedUser.prenom || null,
      avatar_url: updatedUser.avatar_url || defaultAvatar,
    };

    res.json({
      message: "Profil mis à jour avec succès",
      token: newToken,
      user: userResponse,
    });
  } catch (error) {
    console.error("Erreur lors de la modification du profil :", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// PATCH /profile/password - Modifier le mot de passe
router.patch("/password", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    const pool = getPool();

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Le mot de passe actuel et le nouveau mot de passe sont requis" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Le nouveau mot de passe doit contenir au moins 6 caractères" });
    }

    // Récupérer l'utilisateur avec son mot de passe
    const result = await pool.query("SELECT id, password FROM public.user WHERE id = $1", [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    const user = result.rows[0];

    // Vérifier le mot de passe actuel
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Mot de passe actuel incorrect" });
    }

    // Hasher le nouveau mot de passe
    const hashedPassword = await bcrypt.hash(newPassword, 8);

    // Mettre à jour le mot de passe
    await pool.query("UPDATE public.user SET password = $1 WHERE id = $2", [hashedPassword, userId]);

    res.json({ message: "Mot de passe modifié avec succès" });
  } catch (error) {
    console.error("Erreur lors de la modification du mot de passe :", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// DELETE /profile - Supprimer le compte utilisateur
router.delete("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body; // Confirmation par mot de passe
    const pool = getPool();

    if (!password) {
      return res.status(400).json({ message: "Le mot de passe est requis pour supprimer le compte" });
    }

    // Récupérer l'utilisateur avec son mot de passe
    const result = await pool.query("SELECT id, password FROM public.user WHERE id = $1", [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    const user = result.rows[0];

    // Vérifier le mot de passe
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    // Supprimer l'utilisateur
    await pool.query("DELETE FROM public.user WHERE id = $1", [userId]);

    res.json({ message: "Compte supprimé avec succès" });
  } catch (error) {
    console.error("Erreur lors de la suppression du compte :", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;

