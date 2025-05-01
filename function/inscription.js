const express = require ("express");
const router = express.Router()
const bcrypt = require("bcryptjs");
const {getPool} = require ("./../db")


router.post("/signup", async(req, res) => {
    try{
        const {email,username,password,nom,prenom}= req.body;
        const pool = getPool()

        const usercheck = await pool.query("SELECT * FROM public.user WHERE email = $1", [email]);
        if (usercheck.rows.length > 0){
            return res.status(400).json({message :"email existant"});
        }

        const hashedPassword = await bcrypt.hash(password,8);

        const resurlt=await pool.query(
            "INSERT INTO public.user (email, username, password, nom, prenom) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, username, password, nom, prenom",
            [email, username, hashedPassword, nom, prenom]
        );

        res.json(resurlt.rows[0]);
    } catch (error){
        console.error("Ereur lors de l'inscription :",error);
        res.status(500).json({messsage: "Erreur serveur"});
    }
});

module.exports = router;