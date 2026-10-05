import { Request, Response, NextFunction } from 'express';
import logger, { logHTTP } from './logger';

// Middleware para registrar todas las peticiones HTTP
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // Prepara la respuesta para loggear cuando finalice
  const start = Date.now();
  
  // Cuando la respuesta termine, registra los detalles
  res.on('finish', () => {
    const duration = Date.now() - start;
    const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;
    
    // Si es un código de error, loggea como warning o error
    if (res.statusCode >= 500) {
      logger.error(message);
    } else if (res.statusCode >= 400) {
      logger.warn(message);
    } else {
      logHTTP(message);
    }
  });
  
  next();
};

// Middleware para establecer timeout en las requests
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Establecer timeout para la request
    req.setTimeout(timeoutMs, () => {
      if (!res.headersSent) {
        logger.warn(`Request timeout after ${timeoutMs}ms: ${req.method} ${req.originalUrl}`);
        res.status(408).json({
          error: 'Tiempo de espera agotado',
          mensaje: 'La solicitud tardó demasiado tiempo en procesarse'
        });
      }
    });

    // Establecer timeout para la response
    res.setTimeout(timeoutMs, () => {
      if (!res.headersSent) {
        logger.warn(`Response timeout after ${timeoutMs}ms: ${req.method} ${req.originalUrl}`);
        res.status(504).json({
          error: 'Tiempo de espera del servidor agotado',
          mensaje: 'El servidor tardó demasiado tiempo en responder'
        });
      }
    });

    next();
  };
};

// Middleware para manejar errores no capturados
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error(`Error no manejado: ${err.message}`);
  logger.debug(err.stack || 'No stack trace disponible');
  
  // Si ya se envió una respuesta, no intentar enviar otra
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'production' 
      ? 'Se produjo un error en el servidor' 
      : err.message
  });
};

// Middleware para rutas no encontradas
export const unknownEndpoint = (req: Request, res: Response) => {
  logger.warn(`Ruta no encontrada: ${req.method} ${req.originalUrl}`);
  
  res.status(404).json({
    error: 'Ruta no encontrada'
  });
};

export default {
  requestLogger,
  requestTimeout,
  errorHandler,
  unknownEndpoint
};