const express = require("express");
const bcrypt = require("bcryptjs");
const {getPool} = require("./../db");

const router = express.Router();

router.post("/login",async (req,res)=>{
    try{
        const {email, password} = req.body;
        const pool= getPool();

        const result = await pool.query("SELECT * FROM public.user WHERE email = $1",[email]);
        if (result.rows.length === 0){
            return res.status(401).json({message:"Identifiant incorrect"});
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(password, user.password);
        if(!passwordMatch){
            return res.status(401).json({message: "Mot de passe incorrect"});
        }
        res.json({success: true})
    }catch(error){
        console.error("Erreur lors de la connexion :",error);
        res.status(500).json({message:"Erreur serveur"});
    }
});
module.exports = router;