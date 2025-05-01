const express = require('express');
const app = express();

const cors = require("cors")

const inscriptionroutes = require("../backProjet/function/inscription");
const connexionroutes = require("../backProjet/function//connexion")

const PORT = 3000;
const {getPool}= require('./db');
const { getalluser } = require('./function/get_user');
const Pool = getPool()

app.use(express.json())
app.get('/', getalluser);
app.use("/new", inscriptionroutes);
app.use("/user", connexionroutes);

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
