const express = require('express');
const app = express();

const cors = require("cors")

const inscriptionroutes = require("../backProjet/function/inscription");
const connexionroutes = require("../backProjet/function//connexion")
const scanurl = require ("../backProjet/function/scan/scanurl")

const PORT = 3000;
const {getPool}= require('./db');
const { getalluser } = require('./function/get_user');
const Pool = getPool()

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST'],
}))
app.use(express.json())

app.get('/', getalluser);
app.use("/new", inscriptionroutes);
app.use("/user", connexionroutes);
app.use("/scan", scanurl)


// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
