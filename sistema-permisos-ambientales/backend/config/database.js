const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "sistema_permisos_ambientales",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "Z",
});

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log(
      "✅ Conexión exitosa a la base de datos MySQL:",
      process.env.DB_NAME || "sistema_permisos_ambientales",
    );
    connection.release();
  } catch (error) {
    console.error(
      "❌ Error al conectar a la base de datos MySQL:",
      error.message,
    );
  }
}

testConnection();

module.exports = pool;
