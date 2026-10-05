import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import compression from 'compression';
import inscriptosRouter from './routes/inscriptos';
import logger from './utils/logger';
import { requestLogger, requestTimeout, errorHandler, unknownEndpoint } from './utils/middleware';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export default function startServer() {
    const app = express();
    const port = process.env.PORT || 3000;

    // Configurar compresión para mejor performance
    app.use(compression({
        filter: (req, res) => {
            if (req.headers['x-no-compression']) {
                return false;
            }
            return compression.filter(req, res);
        },
        level: 6, // Balancear compresión vs CPU
        threshold: 1024 // Solo comprimir archivos > 1KB
    }));

    // Configurar middleware
    app.use(express.json({ limit: '1mb' })); // Limitar tamaño de payload
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    
    // Middleware de logging para todas las peticiones
    app.use(requestLogger);
    
    // Middleware de timeout para todas las requests (30 segundos)
    app.use(requestTimeout(30000));

    // Configurar rutas para archivos estáticos con caché optimizado
    app.use(express.static(path.join(__dirname, '../public'), {
        maxAge: '1d', // Caché de 1 día para archivos estáticos
        etag: true,
        lastModified: true,
        setHeaders: (res, filePath) => {
            // Caché más largo para assets que no cambian
            if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
                res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 horas
            } else if (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.ico')) {
                res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 días para imágenes
            }
        }
    }));

    // Rutas API
    app.use('/api/inscripcion', inscriptosRouter);

    // Ruta para la página principal
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    });    // No es necesario este middleware ya que no existe la carpeta html
    /*
    app.use('/html', express.static(path.join(__dirname, '../public/html'), {
        etag: false,
        lastModified: false
    }));
    */

    // Fallback para Single Page Application (SPA)
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    // Middleware para manejar endpoints desconocidos debe ir después de todas las rutas
    app.use(unknownEndpoint);
    
    // Middleware para manejar errores debe ir al final
    app.use(errorHandler);

    // Iniciar el servidor
    const server = app.listen(port, () => {
        logger.info(`Servidor corriendo en http://localhost:${port}`);
    });

    return server;
}

// Permitir ejecutar el archivo directamente
if (require.main === module) {
    startServer();
}