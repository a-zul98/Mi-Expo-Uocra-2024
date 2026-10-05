import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql, { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import csv from 'csv-parser';
import logger, { logError } from '../utils/logger';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Definición de la interfaz para los datos de las autoridades del CSV
interface AutoridadCSV {
  id: string;
  apellido: string;
  nombre: string;
  dni: string;
  clave: string;
}

// Crear pool de conexión
const pool: Pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "expoformacionuocra",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Ruta del archivo CSV de autoridades
const archivoAutoridades = path.join(__dirname, 'archive/asistentes-IFTS.csv');

// Función para procesar el archivo CSV de autoridades e insertar en la base de datos
async function procesarArchivoAutoridades(rutaArchivo: string, connection: PoolConnection): Promise<number> {
  let contadorInserciones = 0;
  
  return new Promise((resolve, reject) => {
    const resultados: AutoridadCSV[] = [];
    
    fs.createReadStream(rutaArchivo)
      .pipe(csv({ 
        separator: ',',
        headers: ['id', 'apellido', 'nombre', 'dni', 'clave']
      }))
      .on('data', (data: AutoridadCSV) => {
        // Limpiar los datos de espacios extra
        const autoridadLimpia: AutoridadCSV = {
          id: data.id?.trim() || '',
          apellido: data.apellido?.trim() || '',
          nombre: data.nombre?.trim() || '',
          dni: data.dni?.trim() || '',
          clave: data.clave?.trim() || ''
        };
        resultados.push(autoridadLimpia);
      })
      .on('end', async () => {        try {
          logger.info(`Leyendo ${resultados.length} autoridades del archivo ${path.basename(rutaArchivo)}`);
          
          for (const autoridad of resultados) {
            // Validar que los campos requeridos no estén vacíos
            if (!autoridad.id || !autoridad.apellido || !autoridad.nombre || !autoridad.dni) {
              logger.warn(`Autoridad con datos incompletos: ${autoridad.nombre || 'N/A'} ${autoridad.apellido || 'N/A'} - Omitiendo`);
              continue;
            }
            
            // Intentar insertar en la base de datos
            try {
              const [resultado] = await connection.execute<ResultSetHeader>(
                `INSERT INTO inscriptos 
                 (id, nombre, apellido, dni, email, como_te_enteraste_fk, clave_insti_curso_turno_comision) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  autoridad.id,
                  autoridad.nombre,
                  autoridad.apellido,
                  autoridad.dni,
                  null, // email no disponible para autoridades
                  'AL04', // Código para "Alumno/a de UOCRA"
                  autoridad.clave
                ]
              );
              
              if (resultado.affectedRows > 0) {
                contadorInserciones++;
              }
            } catch (error: any) {
              if (error.code === 'ER_DUP_ENTRY') {
                logger.warn(`DNI duplicado: ${autoridad.dni} - ${autoridad.nombre} ${autoridad.apellido}`);
              } else {
                logError(`Error al insertar autoridad: ${autoridad.nombre} ${autoridad.apellido}`, error);
              }
            }
          }
          
          logger.info(`Se insertaron ${contadorInserciones} autoridades del archivo ${path.basename(rutaArchivo)}`);
          
          resolve(contadorInserciones);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', (error) => {
        logError(`Error al leer el archivo ${path.basename(rutaArchivo)}`, error);
        reject(error);
      });
  });
}

// Función principal
async function main() {
  let connection: PoolConnection | null = null;
  let totalInserciones = 0;
    try {
    logger.info('Iniciando proceso de inserción de autoridades');
    connection = await pool.getConnection();
    
    // Verificar que el archivo existe
    if (fs.existsSync(archivoAutoridades)) {
      logger.info(`Procesando archivo: ${path.basename(archivoAutoridades)}`);
      
      // Procesar el archivo y insertar datos
      const contadorInserciones = await procesarArchivoAutoridades(archivoAutoridades, connection);
      totalInserciones += contadorInserciones;
      
      logger.info(`Proceso completado. Total de autoridades insertadas: ${totalInserciones}`);
      
    } else {
      logger.error(`El archivo ${path.basename(archivoAutoridades)} no existe en la ruta: ${archivoAutoridades}`);
    }
    
  } catch (error) {
    logError('Error durante el proceso de inserción de autoridades', error);  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

// Ejecutar la función principal
main().catch((error) => {
  logError('Error en la ejecución del script de autoridades', error);
  process.exit(1);
});
