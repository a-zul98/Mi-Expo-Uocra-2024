import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql, { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import readline from 'readline';
import logger, { logDB, logError } from '../utils/logger';

// Definición de tipos
interface Charla {
    id: string;
    horario: string;
    titulo: string;
    empresa: string;
    ubicacion: string;
    id_de_charla?: string; // Campo alternativo según los datos
    cupo?: number; // Nuevo campo para el cupo
    participantes?: number; // Campo de participantes en data.json
}

interface DataJSON {
    charlas: Charla[];
    empresas: Record<string, any[]>;
    muestras: any[];
}

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Leer el archivo data.json
const dataPath: string = path.join(__dirname, '..', '..', 'public', 'js', 'data.json');

logger.info(`Leyendo archivo de datos: ${dataPath}`);
let data: DataJSON;

try {
    const jsonData = fs.readFileSync(dataPath, 'utf8');
    data = JSON.parse(jsonData);
    logger.info(`Archivo data.json leído correctamente. Contiene ${data.charlas?.length || 0} charlas.`);
} catch (error) {
    logError('Error al leer o parsear el archivo data.json', error);
    logger.warn('Usando datos vacíos como fallback');
    data = { charlas: [], empresas: {}, muestras: [] };
}

// Función para generar un ID de charla de 3 caracteres alfanuméricos
function generarIdCharla(indice: number): string {
    const prefijo = 'A';
    const numero = (indice + 11).toString().padStart(2, '0');
    const id = `${prefijo}${numero}`;
    logger.debug(`ID de charla generado: ${id}`);
    return id;
}

// Función para asegurar que existe la charla especial 'N/A'
async function asegurarCharlaNA(connection: PoolConnection): Promise<void> {
    try {
        // Verificar si ya existe la charla N/A
        const [charlaNAExistente] = await connection.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM charlas WHERE id = ?', ['N/A']
        );
        
        if (charlaNAExistente[0].count === 0) {
            // Insertar la charla especial N/A
            logger.info('Insertando charla especial "No asistir a charla"');
            await connection.execute(
                'INSERT INTO charlas (id, horario, titulo, empresa, ubicacion, cupo) VALUES (?, ?, ?, ?, ?, ?)',
                ['N/A', 'N/A', 'No asistir a charla', 'N/A', 'N/A', 999999]
            );
            logDB('Charla especial N/A insertada correctamente');
        } else {
            logger.info('La charla especial "No asistir a charla" ya existe');
        }
    } catch (error) {
        logError('Error al verificar/insertar charla especial N/A', error);
        throw error;
    }
}

// Crear pool de conexión directamente en este script
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

async function insertarCharlas(forzarReemplazo: boolean = false): Promise<void> {
    logger.info('Iniciando proceso de actualización de charlas desde data.json');
    logger.info('Se eliminarán todas las charlas existentes (excepto "No asistir a charla") y se insertarán las nuevas');
    const connection: PoolConnection = await pool.getConnection();
    
    try {
        // Verificar si hay charlas existentes (excluyendo la charla especial N/A)
        logger.debug('Verificando existencia de charlas en la base de datos (excluyendo N/A)');
        const [charlasExistentes] = await connection.execute<RowDataPacket[]>('SELECT COUNT(*) as count FROM charlas WHERE id != ?', ['N/A']);
        const hayCharlasExistentes: boolean = charlasExistentes[0].count > 0;

        if (hayCharlasExistentes && !forzarReemplazo) {
            logger.warn('Ya existen charlas en la base de datos (excluyendo N/A) y no se especificó --force');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const respuesta = await new Promise<string>((resolve) => {
                rl.question('Ya existen charlas en la base de datos. ¿Desea reemplazarlas? (Las nuevas charlas de data.json se insertarán y se mantendrá la opción "No asistir a charla") (s/N): ', resolve);
            });

            rl.close();

            if (respuesta.toLowerCase() !== 's' && respuesta.toLowerCase() !== 'si' && respuesta.toLowerCase() !== 'sí') {
                logger.info('Operación cancelada por el usuario');
                return;
            }
            
            logger.info('Usuario confirmó el reemplazo de charlas existentes');
        }

        // Si llegamos aquí, o bien no había charlas o el usuario confirmó el reemplazo
        await connection.beginTransaction();
        logDB('Iniciando transacción para inserción/actualización de charlas');

        if (hayCharlasExistentes) {
            // Realizar un backup antes de eliminar
            const backupPath = path.join(__dirname, '..', '..', 'sql', `backup_charlas_${Date.now()}.sql`);
            logger.info(`Creando backup de charlas existentes en ${backupPath}`);

            try {
                // Obtener las charlas actuales para backup (excluyendo N/A ya que no se eliminará)
                const [charlasActuales] = await connection.execute<RowDataPacket[]>('SELECT * FROM charlas WHERE id != ?', ['N/A']);
                
                // Crear script de backup
                let backupScript = `-- Backup de charlas generado automáticamente\n`;
                backupScript += `-- Fecha: ${new Date().toISOString()}\n\n`;
                
                charlasActuales.forEach((charla) => {
                    backupScript += `INSERT INTO charlas (id, horario, titulo, empresa, ubicacion, cupo) VALUES (\n`;
                    backupScript += `    '${charla.id}', \n`;
                    backupScript += `    '${charla.horario}', \n`;
                    backupScript += `    '${charla.titulo.replace(/'/g, "\\'")}', \n`;
                    backupScript += `    '${charla.empresa.replace(/'/g, "\\'")}', \n`;
                    backupScript += `    '${charla.ubicacion.replace(/'/g, "\\'")}', \n`;
                    backupScript += `    ${charla.cupo}\n`;
                    backupScript += `);\n`;
                });
                
                fs.writeFileSync(backupPath, backupScript);
                logger.info(`Backup de ${charlasActuales.length} charlas guardado correctamente`);
                
                // Limpiar tabla de charlas EXCEPTO la charla especial 'N/A'
                logger.warn('Eliminando charlas existentes de la base de datos (excepto la charla N/A)');
                await connection.execute('DELETE FROM inscriptos_charlas WHERE charlas_id != ?', ['N/A']);
                await connection.execute('DELETE FROM charlas WHERE id != ?', ['N/A']);
                logDB('Tablas de charlas e inscripciones relacionadas limpiadas correctamente (preservando charla N/A)');
            } catch (error) {
                logError('Error al crear backup o limpiar tablas', error);
                await connection.rollback();
                return;
            }
        }
        
        // Confirmar transacción para la limpieza
        await connection.commit();
        logDB('Limpieza de charlas completada correctamente');
        
        // Iniciar nueva transacción para inserción
        await connection.beginTransaction();
        logDB('Iniciando nueva transacción para inserción de charlas');

        // Insertar nuevas charlas
        let contadorInserciones = 0;
        
        // Verificar que tenemos charlas para insertar
        if (!data.charlas || data.charlas.length === 0) {
            logger.warn('No hay charlas en el archivo data.json para insertar');
            await connection.rollback();
            return;
        }

        logger.info(`Preparando para insertar ${data.charlas.length} charlas desde data.json`);
        
        // Procesar e insertar cada charla
        for (let i = 0; i < data.charlas.length; i++) {
            const charla = data.charlas[i];
            
            try {                // Usar ID existente o generar uno nuevo con formato de 4 caracteres
                const id = charla.id_de_charla || charla.id || generarIdCharla(i);
                
                // Normalizar la hora si es necesario
                let horario = charla.horario;
                if (!horario.includes(':')) {
                    horario = `${horario}:00`;
                    logger.debug(`Normalizado el formato de hora para ${id}: ${horario}`);
                }
                
                // Usar el campo participantes como cupo
                const cupo = charla.participantes || charla.cupo || 50; // Default a 50 si no existe
                
                // Insertar charla
                logger.debug(`Insertando charla: ${id} - ${charla.titulo}, Cupo: ${cupo}`);
                await connection.execute(
                    'INSERT INTO charlas (id, horario, titulo, empresa, ubicacion, cupo) VALUES (?, ?, ?, ?, ?, ?)',
                    [id, horario, charla.titulo, charla.empresa, charla.ubicacion, cupo]
                );
                
                contadorInserciones++;
                logDB(`Charla insertada: ID=${id}, Título=${charla.titulo}, Cupo=${cupo}`);
                
            } catch (error: any) {
                // Manejar errores específicos
                if (error.code === 'ER_DUP_ENTRY') {
                    logger.warn(`Charla duplicada: ${charla.id || charla.id_de_charla || charla.titulo} - Omitiendo`);
                } else {
                    logError(`Error al insertar charla ${JSON.stringify(charla)}`, error);
                    throw error; // Propagar el error para el rollback
                }
            }
        }
        
        // Confirmar transacción de inserción
        await connection.commit();
        logger.info(`Inserción completada: ${contadorInserciones} charlas insertadas correctamente`);
        
        // Asegurar que existe la charla especial 'N/A' para "No asistir a charla"
        await asegurarCharlaNA(connection);
        
        logger.info('Proceso de actualización de charlas completado exitosamente');
        
    } catch (error) {
        await connection.rollback();
        logError('Error durante la inserción de charlas', error);
        process.exit(1);
    } finally {
        connection.release();
        logDB('Conexión liberada');
    }
}

// Función para procesar argumentos de línea de comandos
function procesarArgumentos(): boolean {
    const args: string[] = process.argv.slice(2);
    return args.includes('--force');
}

// Ejecutar el script
(async () => {
    try {
        const forzarReemplazo: boolean = procesarArgumentos();
        
        if (forzarReemplazo) {
            logger.warn('Modo forzado activado: se reemplazarán todas las charlas (excepto N/A) sin confirmación');
        }
        
        await insertarCharlas(forzarReemplazo);
        logger.info('Script finalizado correctamente');
        
        // Properly end the pool connection
        await pool.end();
        logger.debug('Pool de conexiones cerrado correctamente');
        
        process.exit(0);
    } catch (error) {
        logError('Error general en el script', error);
        
        // Make sure to end the pool even on error
        try {
            await pool.end();
            logger.debug('Pool de conexiones cerrado correctamente');
        } catch (endError) {
            logError('Error al cerrar el pool de conexiones', endError);
        }
        
        process.exit(1);
    }
})();