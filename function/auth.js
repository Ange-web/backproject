// middleware/auth.js
const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]; // format : Bearer <token>

  if (!token) {
    return res.status(401).json({ message: "Token manquant" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // clé secrète stockée dans .env
    req.user = decoded; // tu peux ajouter les infos de l'utilisateur à req
    next();
  } catch (err) {
    return res.status(403).json({ message: "Token invalide" });
  }
};

module.exports = verifyToken;
