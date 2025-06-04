const {Pool} = require ("pg");

let globalPool;

const getPool = ( ) =>{
    if (!globalPool){
        globalPool = new Pool({
            connectionString: "postgresql://nspy_owner:npg_gIoQVf6P9UAd@ep-sparkling-rain-a4pebswd-pooler.us-east-1.aws.neon.tech/nspy?sslmode=require",
            ssl: {rejectUnauthorized: false},
        });
    }
    return globalPool;
};

const getJwtSecret = () =>{
    return process.env.JWT_SECRET
}
module.exports = {getPool, getJwtSecret};