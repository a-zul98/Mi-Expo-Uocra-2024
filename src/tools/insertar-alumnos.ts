import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import mysql, { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import csv from 'csv-parser';
import logger, { logError } from '../utils/logger';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Definición de la interfaz para los datos de los alumnos
interface Alumno {
  APELLIDO: string;
  NOMBRE: string;
  EMAIL: string;
  INSTITUCION: string;
  CURSO: string;
  TURNO: string;
  COMISION: string;
  DNI: string;
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

// Rutas de los archivos CSV
const archivosCSV = [
  path.join(__dirname, '../../src/tools/archive/preinscripcion-1.csv'),
  path.join(__dirname, '../../src/tools/archive/preinscripcion-2.csv'),
  path.join(__dirname, '../../src/tools/archive/preinscripcion-3.csv')
];

// Función para normalizar el curso (reemplazar espacios por guiones bajos)
function normalizarCurso(curso: string): string {
  return curso.replace(/\s+/g, '_');
}

// Función para generar la clave
function generarClaveInstiCursoTurnoComision(alumno: Alumno): string {
  const cursoNormalizado = normalizarCurso(alumno.CURSO);
  return `${alumno.INSTITUCION}-----${cursoNormalizado}-----${alumno.TURNO}-----${alumno.COMISION}`;
}

// Función para procesar un archivo CSV
async function procesarArchivoCSV(rutaArchivo: string, connection: PoolConnection): Promise<number> {
  let contadorInserciones = 0;
  
  return new Promise((resolve, reject) => {
    const resultados: Alumno[] = [];
    
    fs.createReadStream(rutaArchivo)
      .pipe(csv({ 
        separator: ';',
        mapHeaders: ({ header }) => header.trim() 
      }))
      .on('data', (data: Alumno) => {
        resultados.push(data);
      })
      .on('end', async () => {
        try {
          logger.info(`Leyendo ${resultados.length} alumnos del archivo ${path.basename(rutaArchivo)}`);
          
          for (const alumno of resultados) {
            // Validar que el DNI no esté vacío
            if (!alumno.DNI || alumno.DNI.trim() === '') {
              logger.warn(`Alumno sin DNI: ${alumno.NOMBRE} ${alumno.APELLIDO} - Omitiendo`);
              continue;
            }
            
            // Generar clave
            const claveInstiCursoTurnoComision = generarClaveInstiCursoTurnoComision(alumno);
            
            // Intentar insertar en la base de datos
            try {
              const [resultado] = await connection.execute<ResultSetHeader>(
                'INSERT INTO inscriptos (id, nombre, apellido, dni, email, como_te_enteraste_fk, clave_insti_curso_turno_comision) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                  uuidv4(),
                  alumno.NOMBRE.trim(),
                  alumno.APELLIDO.trim(),
                  alumno.DNI.trim(),
                  alumno.EMAIL ? alumno.EMAIL.trim() : null,
                  'AL04', // Valor predeterminado para "como_te_enteraste_fk" (Alumno de UOCRA)
                  claveInstiCursoTurnoComision
                ]
              );
              
              if (resultado.affectedRows > 0) {
                contadorInserciones++;
              }
            } catch (error: any) {
              if (error.code === 'ER_DUP_ENTRY') {
                logger.warn(`DNI duplicado: ${alumno.DNI} - ${alumno.NOMBRE} ${alumno.APELLIDO}`);
              } else {
                logError(`Error al insertar alumno: ${alumno.NOMBRE} ${alumno.APELLIDO}`, error);
              }
            }
          }
          
          logger.info(`Se insertaron ${contadorInserciones} alumnos del archivo ${path.basename(rutaArchivo)}`);
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
    logger.info('Iniciando proceso de inserción de alumnos');
    connection = await pool.getConnection();
    
    // Procesar cada archivo CSV
    for (const archivoCSV of archivosCSV) {
      if (fs.existsSync(archivoCSV)) {
        const contadorInserciones = await procesarArchivoCSV(archivoCSV, connection);
        totalInserciones += contadorInserciones;
      } else {
        logger.warn(`El archivo ${path.basename(archivoCSV)} no existe`);
      }
    }
    
    logger.info(`Proceso completado. Total de alumnos insertados: ${totalInserciones}`);
  } catch (error) {
    logError('Error durante el proceso de inserción', error);
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

// Ejecutar la función principal
main().catch((error) => {
  logError('Error en la ejecución del script', error);
  process.exit(1);
});