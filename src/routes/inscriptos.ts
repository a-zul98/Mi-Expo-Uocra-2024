import { Router, Response } from "express";
import { OkPacket, RowDataPacket, PoolConnection } from "mysql2/promise";
import pool from "../database/database";
import dotenv from "dotenv";
import path from "path";
import { v4 as uuidv4 } from 'uuid';
import logger, { logDB, logError } from "../utils/logger";

// Cargar variables de entorno desde el archivo .env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Caché en memoria para consultas frecuentes
interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

class InMemoryCache {
    private cache = new Map<string, CacheEntry<any>>();

    set<T>(key: string, data: T, ttlMinutes: number = 5): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttlMinutes * 60 * 1000
        });
    }

    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    clear(): void {
        this.cache.clear();
    }
}

const cache = new InMemoryCache();

// Interfaces para los datos
interface RequiredFields {
    nombre?: string;
    apellido?: string;
    dni?: string;
    email?: string;
    como_te_enteraste?: string;
    charlas?: string[] | string;
    [key: string]: any;
}

const router = Router();

// Endpoint para registrar una inscripción
router.post("/", async (req, res) => {
    let conexion: PoolConnection | undefined;
    const startTime = Date.now();
    
    try {
        logger.info(`Nueva inscripción recibida: ${req.body.nombre} ${req.body.apellido}`);
        logger.debug("Datos recibidos en el servidor:", req.body);
        
        const { nombre, apellido, dni, email, como_te_enteraste, charlas} = req.body;
        const id = req.body.id || generarUUID(); // Usar ID proporcionado o generar uno nuevo

        // Validación mejorada
        logger.debug("Iniciando validación de campos requeridos");
        validateRequiredFields({ nombre, apellido, dni, email, como_te_enteraste, charlas });
        logger.debug("Validación de campos completada exitosamente");

        // Normalizar charlas a array
        const charlasArray = Array.isArray(charlas) ? charlas : [charlas];
        logger.debug(`Charlas normalizadas: ${charlasArray.length} charla(s)`);
        
        logger.debug("Obteniendo conexión a la base de datos");
        conexion = await pool.getConnection();
        await conexion.beginTransaction();
        logDB(`Iniciando transacción para inscripción de ${nombre} ${apellido} con ${charlasArray.length} charla(s)`);

        // Obtener ID válido para como_te_enteraste con mejores mensajes de error
        logger.debug("Validando 'como_te_enteraste'");
        const comoTeEnterasteId = await getValidComoTeEnterasteId(conexion, como_te_enteraste);
        logger.debug(`ID válido para como_te_enteraste: ${comoTeEnterasteId}`);

        // Verificar duplicados con mensaje claro
        logger.debug("Verificando usuarios duplicados");
        await checkExistingUser(conexion, email, dni);
        logger.debug("Verificación de duplicados completada");

        // Insertar usuario
        logger.debug("Insertando usuario en la base de datos");
        await insertUser(conexion, id, nombre, apellido, dni, email, comoTeEnterasteId);
        logger.debug("Usuario insertado correctamente");

        // Procesar múltiples charlas - Optimización: Batch insert
        const charlasInscritas: string[] = [];
        if (charlasArray.length > 0) {
            logger.debug("Procesando charlas seleccionadas");
            // Validar todas las charlas primero
            const charlasValidas: string[] = [];
            for (const charla of charlasArray) {
                const idCharla = await getValidCharlaId(conexion, charla);
                charlasValidas.push(idCharla);
            }

            // Insertar todas las relaciones en batch
            if (charlasValidas.length > 0) {
                const valores = charlasValidas.map(charlaId => [id, charlaId]);
                await conexion.query(
                    "INSERT INTO inscriptos_charlas (inscriptos_id, charlas_id) VALUES ?",
                    [valores]
                );
                logDB(`Usuario ${id} inscripto a ${charlasValidas.length} charla(s) en batch`);
                charlasInscritas.push(...charlasValidas);
            }
        }

        logger.debug("Confirmando transacción");
        await conexion.commit();
        
        const processingTime = Date.now() - startTime;
        logger.info(`Transacción completada exitosamente para ${nombre} ${apellido} (${dni}) con ${charlasInscritas.length} charla(s) en ${processingTime}ms`);

        res.status(201).json({
            mensaje: "Inscripción guardada correctamente",
            id,
            charlasInscritas
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`Error en inscripción después de ${processingTime}ms:`, error);
        
        if (conexion) {
            try {
                await conexion.rollback();
                logDB("Transacción cancelada por error");
            } catch (rollbackError) {
                logError("Error al hacer rollback", rollbackError);
            }
        }
        handleError(error as Error, res);
    } finally {
        if (conexion) {
            conexion.release();
            logger.debug("Conexión a la base de datos liberada");
        }
    }
});

// Helper functions to make code more modular and readable
function validateRequiredFields(fields: RequiredFields): void {
    const camposFaltantes = Object.entries(fields)
        .filter(([clave, valor]) => {
            // Para charlas, verificar que sea un array no vacío o un string no vacío
            if (clave === 'charlas') {
                if (Array.isArray(valor)) {
                    return valor.length === 0;
                }
                return valor === undefined || valor === null || valor === "";
            }
            // Para otros campos, verificación normal
            return valor === undefined || valor === null || valor === "";
        })
        .map(([clave]) => clave);

    if (camposFaltantes.length > 0) {
        logger.warn(`Campos faltantes en el formulario: ${camposFaltantes.join(', ')}`);
        throw new Error(`Campos obligatorios faltantes: ${camposFaltantes.join(', ')}`);
    }
}

// Obtener ID válido para como_te_enteraste con mejores mensajes de error
async function getValidComoTeEnterasteId(conexion: PoolConnection, como_te_enteraste: string): Promise<string> {
    // Verificar si el valor de como_te_enteraste existe en la tabla como_te_enteraste
    const [comoTeEnterasteCheck] = await conexion.execute(
        "SELECT id FROM como_te_enteraste WHERE id = ?",
        [como_te_enteraste]
    ) as [RowDataPacket[], any];

    let comoTeEnterasteId: string;

    // Si existe el ID exacto, úsalo
    if (comoTeEnterasteCheck.length > 0) {
        comoTeEnterasteId = comoTeEnterasteCheck[0].id;
        logDB(`Usando ID exacto para como_te_enteraste: ${comoTeEnterasteId}`);
    } else {
        // Si no existe, buscar por descripción como fallback
        const [comoTeEnterasteResult] = await conexion.execute(
            "SELECT id FROM como_te_enteraste WHERE descripcion LIKE ?",
            [`%${como_te_enteraste}%`]
        ) as [RowDataPacket[], any];

        if (comoTeEnterasteResult.length > 0) {
            comoTeEnterasteId = comoTeEnterasteResult[0].id;
            logDB(`Usando ID por coincidencia para como_te_enteraste: ${comoTeEnterasteId}`);
        } else {
            // Si tampoco encontramos por descripción, obtener el primer ID válido como plan B
            const [defaultOption] = await conexion.execute(
                "SELECT id FROM como_te_enteraste LIMIT 1"
            ) as [RowDataPacket[], any];

            if (defaultOption.length > 0) {
                comoTeEnterasteId = defaultOption[0].id;
                logger.warn(`Usando ID predeterminado para como_te_enteraste: ${comoTeEnterasteId}`);
            } else {
                // Si no hay opciones en la tabla, registrar el error y fallar
                logger.error("No hay opciones válidas en la tabla como_te_enteraste");
                throw new Error("No hay opciones válidas en la tabla como_te_enteraste");
            }
        }
    }
    return comoTeEnterasteId;
}

// Verificar duplicados con mensaje claro - Optimización: una sola consulta
async function checkExistingUser(conexion: PoolConnection, email: string, dni: string): Promise<void> {
    // Verificar ambos en una sola consulta para mejor performance
    const [usuarios] = await conexion.execute(
        "SELECT dni, email FROM inscriptos WHERE dni = ? OR email = ?",
        [dni, email]
    ) as [RowDataPacket[], any];

    if (usuarios.length > 0) {
        const usuarioExistente = usuarios[0];
        
        if (usuarioExistente.dni === dni) {
            logger.warn(`Intento de inscripción con DNI duplicado: ${dni}`);
            throw new Error("Ya existe un usuario registrado con este DNI");
        }
        
        if (usuarioExistente.email === email) {
            logger.warn(`Intento de inscripción con email duplicado: ${email}`);
            throw new Error("Ya existe un usuario registrado con este email");
        }
    }
}

// Insertar usuario
async function insertUser(
    conexion: PoolConnection,
    id: string,
    nombre: string,
    apellido: string,
    dni: string,
    email: string,
    comoTeEnterasteId: string
): Promise<void> {
    // Insertar participante en la tabla correcta (inscriptos)
    await conexion.execute(
        "INSERT INTO inscriptos (id, nombre, apellido, dni, email, como_te_enteraste_fk) VALUES (?, ?, ?, ?, ?, ?)",
        [id, nombre, apellido, dni, email, comoTeEnterasteId]
    );
    logDB(`Usuario insertado correctamente: ${id}, ${nombre} ${apellido}`);
}

// Obtener ID válido de charla y verificar cupo disponible
async function getValidCharlaId(conexion: PoolConnection, charla: string): Promise<string> {
    // Si es "no-charla", el usuario no quiere asistir a ninguna charla
    if (charla === 'no-charla') {
        logger.info('Usuario eligió no asistir a ninguna charla');
        return 'N/A'; // Usamos el ID 'N/A' que corresponde al registro especial en la base de datos
    }
    
    // Verificar si la charla existe por su ID
    const [charlasExistentes] = await conexion.execute(
        "SELECT id, titulo, cupo FROM charlas WHERE id = ?",
        [charla]
    ) as [RowDataPacket[], any];

    let idCharla = charla;

    if (charlasExistentes.length === 0) {
        // La charla no existe, pero podemos intentar buscarla por su título
        const [charlaPorTitulo] = await conexion.execute(
            "SELECT id, cupo FROM charlas WHERE titulo LIKE ?",
            [`%${charla}%`]
        ) as [RowDataPacket[], any];

        if (charlaPorTitulo.length > 0) {
            idCharla = charlaPorTitulo[0].id;
            logger.warn(`Usando ID de charla por coincidencia de título: ${idCharla}`);
        } else {
            logger.error(`La charla seleccionada no existe: ${charla}`);
            throw new Error("La charla seleccionada no existe");
        }
    }

    // Si es el registro especial N/A, no necesitamos verificar cupo
    if (idCharla === 'N/A') {
        return idCharla;
    }

    // Verificar si la charla tiene cupo disponible
    const [inscriptosCharla] = await conexion.execute<RowDataPacket[]>(
        "SELECT COUNT(*) as total FROM inscriptos_charlas WHERE charlas_id = ?",
        [idCharla]
    );
    
    const totalInscritos = inscriptosCharla[0].total;
    
    // Obtener el cupo máximo de la charla
    const [infoCharla] = await conexion.execute<RowDataPacket[]>(
        "SELECT cupo FROM charlas WHERE id = ?",
        [idCharla]
    );
    
    const cupoMaximo = infoCharla[0].cupo;
    
    // Verificar si hay cupo disponible
    if (totalInscritos >= cupoMaximo) {
        logger.warn(`Charla ${idCharla} ha alcanzado su cupo máximo de ${cupoMaximo} inscriptos`);
        throw new Error(`La charla seleccionada ha alcanzado su capacidad máxima de ${cupoMaximo} participantes`);
    }
    
    logger.info(`Charla ${idCharla} tiene ${totalInscritos}/${cupoMaximo} inscriptos`);
    return idCharla;
}

// Generic error handler
function handleError(error: Error, res: Response): void {
    const message = error.message || "Error desconocido";
    logError("Error en endpoint de inscripción", error);
    
    // Solo enviar respuesta si no se ha enviado ya
    if (!res.headersSent) {
        let statusCode = 500;
        let errorResponse = {
            error: "Error al procesar la solicitud",
            mensaje: message
        };

        // Manejar diferentes tipos de errores con códigos de estado apropiados
        if (message.includes("Campos obligatorios faltantes")) {
            statusCode = 400;
            errorResponse.error = "Datos incompletos";
        } else if (message.includes("Ya existe un usuario registrado")) {
            statusCode = 409; // Conflict
            errorResponse.error = "Usuario ya registrado";
        } else if (message.includes("charla") && message.includes("capacidad")) {
            statusCode = 409; // Conflict
            errorResponse.error = "Charla sin cupos disponibles";
        } else if (message.includes("charla") && message.includes("no existe")) {
            statusCode = 400; // Bad Request
            errorResponse.error = "Charla no válida";
        } else if (message.includes("como_te_enteraste")) {
            statusCode = 400; // Bad Request
            errorResponse.error = "Opción de contacto no válida";
        }

        res.status(statusCode).json(errorResponse);
    }
}

// Endpoint para obtener todas las charlas - Con caché optimizado
router.get("/charlas", async (req, res) => {
    try {
        logger.info("Solicitud de listado de charlas");
        
        // Verificar caché primero
        const cacheKey = 'charlas_listado';
        const charlasEnCache = cache.get<any[]>(cacheKey);
        
        if (charlasEnCache) {
            logger.debug(`Enviando ${charlasEnCache.length} charlas desde caché`);
            return res.status(200).json(charlasEnCache);
        }

        const conexion = await pool.getConnection();
        try {
            // Consulta optimizada con índices
            const [charlas] = await conexion.query<RowDataPacket[]>(`
                SELECT 
                    c.id as id, 
                    c.titulo, 
                    c.horario,
                    c.empresa,
                    c.ubicacion,
                    c.cupo,
                    COALESCE(ic.participantes_inscritos, 0) as participantes_inscritos
                FROM charlas c
                LEFT JOIN (
                    SELECT charlas_id, COUNT(*) as participantes_inscritos 
                    FROM inscriptos_charlas 
                    GROUP BY charlas_id
                ) ic ON c.id = ic.charlas_id
                ORDER BY c.horario, c.titulo
            `);
            
            logDB(`Se encontraron ${charlas.length} charlas en la base de datos`);

            // Transformamos el formato de las charlas para que coincida con lo esperado en el frontend
            const charlasFormateadas = charlas.map(charla => {
                // Dar formato a la fecha/hora
                let horaInicio, horaFin;

                // Verificar si horario es una fecha o un string de formato 'HH:MM'
                if (charla.horario instanceof Date) {
                    const horarioDate = new Date(charla.horario);
                    horaInicio = horarioDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                    horaFin = new Date(horarioDate.getTime() + 45 * 60000)
                        .toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                } else if (typeof charla.horario === 'string' && charla.horario.includes(':')) {
                    // Si es un formato como '13:00'
                    horaInicio = charla.horario;

                    // Calcular hora fin (sumando 45 minutos)
                    const [horas, minutos] = charla.horario.split(':').map(Number);
                    let horasFinales = horas;
                    let minutosFinales = minutos + 45;

                    if (minutosFinales >= 60) {
                        horasFinales += 1;
                        minutosFinales -= 60;
                    }

                    horaFin = `${horasFinales.toString().padStart(2, '0')}:${minutosFinales.toString().padStart(2, '0')}`;
                } else {
                    // Formato predeterminado si no podemos determinar
                    horaInicio = '00:00';
                    horaFin = '00:45';
                }

                return {
                    id: charla.id,
                    horario: `${horaInicio} - ${horaFin}`,
                    titulo: charla.titulo || "Charla sin título",
                    empresa: charla.empresa || "UOCRA Formación",
                    ubicacion: charla.ubicacion || "Aula Principal",
                    capacidad_maxima: charla.cupo || 50,
                    descripcion: charla.titulo || "Charla sin título",
                    participantes: charla.participantes_inscritos || 0
                };
            });

            // Guardar en caché por 3 minutos
            cache.set(cacheKey, charlasFormateadas, 3);

            res.status(200).json(charlasFormateadas);
            logger.debug(`Enviadas ${charlasFormateadas.length} charlas formateadas al cliente`);
        } finally {
            conexion.release();
        }
    } catch (error: any) {
        logError("Error al obtener charlas", error);
        res.status(500).json({
            error: "Error al obtener charlas",
            mensaje: error.message
        });
    }
});

// Endpoint para obtener todas las opciones de "cómo te enteraste" - Con caché
router.get("/como-te-enteraste", async (req, res) => {
    try {
        logger.info("Solicitud de opciones de 'cómo te enteraste'");
        
        // Verificar caché primero
        const cacheKey = 'como_te_enteraste_opciones';
        const opcionesEnCache = cache.get<any[]>(cacheKey);
        
        if (opcionesEnCache) {
            logger.debug(`Enviando ${opcionesEnCache.length} opciones desde caché`);
            return res.json(opcionesEnCache);
        }

        const conexion = await pool.getConnection();
        try {
            // Obtenemos las opciones de "cómo te enteraste"
            const [opciones] = await conexion.query<RowDataPacket[]>(`
                SELECT 
                    id, 
                    descripcion 
                FROM como_te_enteraste
                ORDER BY descripcion
            `);

            // Guardar en caché por 10 minutos (estos datos cambian muy poco)
            cache.set(cacheKey, opciones, 10);

            logger.debug(`Enviando ${opciones.length} opciones de 'cómo te enteraste'`);
            res.json(opciones);
        } catch (error: any) {
            logError("Error al consultar las opciones", error);
            res.status(500).json({
                error: "Error al obtener las opciones",
                mensaje: error.message
            });
        } finally {
            conexion.release();
        }
    } catch (error: any) {
        logError("Error general en endpoint como-te-enteraste", error);
        res.status(500).json({
            error: "Error al procesar la solicitud",
            mensaje: error.message
        });
    }
});

// Endpoint para recibir logs del cliente
router.post("/logs", (req, res) => {
    try {
        const { level, message, timestamp, data } = req.body;
        
        // Validar los datos mínimos
        if (!level || !message) {
            return res.status(400).json({ error: "Faltan datos requeridos (level, message)" });
        }
        
        // Registrar según nivel
        switch(level.toLowerCase()) {
            case 'error':
                logger.error(`[Cliente] ${message}`, data);
                break;
            case 'warn':
                logger.warn(`[Cliente] ${message}`, data);
                break;
            case 'info':
                logger.info(`[Cliente] ${message}`, data);
                break;
            default:
                logger.debug(`[Cliente] ${message}`, data);
        }
        
        res.status(202).end(); // Aceptado, sin contenido
    } catch (error) {
        logger.error("Error al procesar log del cliente", { error });
        res.status(500).end(); // No enviamos detalles al cliente
    }
});

// Endpoint para invalidar caché (útil para administración)
router.post("/cache/clear", (req, res) => {
    try {
        cache.clear();
        logger.info("Caché invalidado manualmente");
        res.json({ mensaje: "Caché limpiado correctamente" });
    } catch (error) {
        logger.error("Error al limpiar caché", { error });
        res.status(500).json({ error: "Error al limpiar caché" });
    }
});

// Función auxiliar para generar UUID
function generarUUID(): string {
    return uuidv4();
}

export default router;