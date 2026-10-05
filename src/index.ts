import 'dotenv/config'
import express from "express";
import path from "path";
import cors from "cors";
import inscriptosRouter from "./routes/inscriptos";
import { execSync } from 'child_process';
import logger, { logError } from './utils/logger';

// Get command line arguments
const comando = process.argv[2] || 'servidor';
const parametros = process.argv.slice(3);

// Main entry point with switch structure
switch (comando) {
  case 'servidor':
    logger.info('Iniciando el servidor HTTP...');
    // Direct server initialization
    const app = express();
    const PORT = process.env.PORT || 3000;

    // Middleware configuration - Eliminar log de peticiones HTTP
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cors());

    // Static and API routes
    app.use(express.static(path.join(__dirname, "../public")));
    app.use("/api/inscripcion", inscriptosRouter);

    app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/index.html"));
    });

    // Start the server with port retry logic
    const startServer = (port: number) => {
      const server = app.listen(port, () => {
        logger.info(`Servidor HTTP iniciado en http://localhost:${port}`);
      }).on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.warn(`Puerto ${port} en uso, intentando con el puerto ${port + 1}...`);
          startServer(port + 1);
        } else {
          logError('Error starting server', error);
          process.exit(1);
        }
      });
    };

    startServer(Number(PORT));
    break;
  case 'charlas':
    logger.info('Insertando charlas en la base de datos...');
    const forceReplace = parametros.includes('--force') ? ' --force' : '';
    // Determine if we're running in ts-node or compiled JS
    const fileExtension = __filename.endsWith('.ts') ? '.ts' : '.js';
    const scriptPathCharlas = path.join(__dirname, 'tools', `insertar-charlas${fileExtension}`);
    try {
      // Use ts-node for TypeScript files, node for JavaScript files
      const command = fileExtension === '.ts' 
        ? `npx ts-node ${scriptPathCharlas}${forceReplace}`
        : `node ${scriptPathCharlas}${forceReplace}`;
      execSync(command, { stdio: 'inherit' });
    } catch (error) {
      logError('Error al insertar charlas', error);
      process.exit(1);
    }
    break;
  case 'inscriptos':
    const cantidad = parametros.length > 0 && !parametros[0].startsWith('--') ? parametros[0] : '50';
    logger.info(`Generando ${cantidad} inscriptos de prueba...`);
    const scriptPathInscriptos = path.join(__dirname, 'tools', 'insertar-inscriptos.js');
    try {
      execSync(`node ${scriptPathInscriptos} ${cantidad}`, { stdio: 'inherit' });
    } catch (error) {
      logError('Error al generar inscriptos de prueba', error);
      process.exit(1);
    }
    break;

  case 'alumnos':
    logger.info('Importando alumnos desde archivos CSV...');
    // Determine if we're running in ts-node or compiled JS
    const fileExtensionAlumnos = __filename.endsWith('.ts') ? '.ts' : '.js';
    const scriptPathAlumnos = path.join(__dirname, 'tools', `insertar-alumnos${fileExtensionAlumnos}`);
    try {
      // Use ts-node for TypeScript files, node for JavaScript files
      const commandAlumnos = fileExtensionAlumnos === '.ts' 
        ? `npx ts-node ${scriptPathAlumnos}`
        : `node ${scriptPathAlumnos}`;
      execSync(commandAlumnos, { stdio: 'inherit' });
    } catch (error) {
      logError('Error al importar alumnos', error);
      process.exit(1);
    }
    break;
  default:
    logger.info(`
Uso: npm run start [comando] [parámetros]

Comandos disponibles:

servidor               - Inicia el servidor HTTP (valor predeterminado)
charlas [--force]      - Inserta charlas desde data.json en la base de datos
                        (--force: reemplaza charlas existentes sin preguntar)
inscriptos [cantidad]  - Genera la cantidad especificada de inscriptos aleatorios
                        (default: 50)
alumnos                - Importa alumnos desde archivos CSV de preinscripción
                        (utiliza la fuente "Alumno de UOCRA")`);
}