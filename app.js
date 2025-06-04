const express = require('express');
const app = express();

const cors = require("cors")

const inscriptionroutes = require("../backProjet/function/inscription");
const connexionroutes = require("../backProjet/function//connexion");
const scanurl = require ("../backProjet/function/scan/scanurl");
const scanport = require ("../backProjet/function/scan/scanport");
const scanip = require ("../backProjet/function/scan/scanip");
const iaollama= require("../backProjet/function/scan/iaollama")
const PORT = 3000;
const {getPool}= require('./db');
const { getalluser } = require('./function/get_user');
const Pool = getPool()

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

app.get('/', getalluser);
app.use("/new", inscriptionroutes);
app.use("/user", connexionroutes);
app.use("/scan", scanurl);
app.use("/scan", scanport);
app.use("/scan", scanip);
app.use("/scan", iaollama);



// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
