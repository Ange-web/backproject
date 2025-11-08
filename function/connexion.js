const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {getPool, getJwtSecret} = require("./../db");
require("dotenv").config()
const router = express.Router();

router.post("/login",async (req,res)=>{
    try{
        const {email, password} = req.body;
        const pool= getPool();
        const jwtSecret = getJwtSecret();

        const result = await pool.query("SELECT id, email, username, password, nom, prenom, avatar_url FROM public.user WHERE email = $1",[email]);
        if (result.rows.length === 0){
            return res.status(401).json({message:"Identifiant incorrect"});
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(password, user.password);
        if(!passwordMatch){
            return res.status(401).json({message: "Mot de passe incorrect"});
        }

        const token= jwt.sign(
            {
            id : user.id,
            email: user.email,
            username: user.username,
            nom: user.nom,
            prenom: user.prenom
            },
            jwtSecret,
            {expiresIn: "1h"}
        );
        const defaultAvatar= "https://www.flaticon.com/svg/static/icons/svg/6809/6809608.svg";
        res.json({token,
            user:{
                id: user.id,
                username: user.username,
                email: user.email,
                nom: user.nom,
                prenom: user.prenom,
                avatar_url: user.avatar_url || defaultAvatar,
            },
        });
    }catch(error){
        console.error("Erreur lors de la connexion :",error);
        res.status(500).json({message:"Erreur serveur"});
    }
});
module.exports = router;