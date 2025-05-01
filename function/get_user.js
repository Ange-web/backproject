const {getPool} = require('./../db')
const pool = getPool()

const getalluser = async(req, res) =>{
    const result = await pool.query("SELECT * FROM public.user");
    return res.json(result.rows);
}

module.exports = {getalluser}