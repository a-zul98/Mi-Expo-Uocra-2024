// Importar módulo de notificaciones
import notifications from './utils/notifications.js';

// Integración con main.js usando el sistema de eventos
document.addEventListener('DOMContentLoaded', () => {
  console.log('Preparando la aplicación...');
  
  // Intentar configurar la app inmediatamente o esperar a que se cargue main.js
  if (window.AppEventBus) {
    configurarApp();
  } else {
    document.addEventListener('main:loaded', configurarApp);
    esperarCargaEventBus();
  }

  // Ahora que estamos en un módulo ES6, configuramos todos los event listeners aquí
  configurarEventListeners();
});

// Configurar los event listeners para toda la aplicación
function configurarEventListeners() {
  // Manejo de clics en elementos con data-seccion
  document.querySelectorAll('[data-seccion]').forEach(element => {
    element.addEventListener('click', () => {
      const seccion = element.getAttribute('data-seccion');
      mostrarSeccion(seccion);
    });
  });

  // Manejo del botón de alternar menú
  document.getElementById('toggle-menu')?.addEventListener('click', alternarMenu);

  // Manejo del botón de inscribirme ahora
  document.getElementById('btn-inscribirme')?.addEventListener('click', mostrarFormulario);
  // Manejo de botones de categoría de empresas
  document.querySelectorAll('#empresas .btn-categoria').forEach(button => {
    button.addEventListener('click', () => {
      const categoria = button.getAttribute('data-categoria');
      mostrarEmpresas(categoria);
    });
  });

  // Ya no hay botones de categoría de competencias
}

// Función para esperar la carga del EventBus con un límite de tiempo
function esperarCargaEventBus() {
  let intentos = 0;
  const maxIntentos = 15; // 15 * 200ms = 3 segundos máximo
  
  const interval = setInterval(() => {
    intentos++;
    
    if (window.AppEventBus) {
      clearInterval(interval);
      configurarApp();
    } else if (intentos >= maxIntentos) {
      clearInterval(interval);
      // Intentar continuar con lo básico
      setupFormEventListeners();
    }
  }, 200);
}

// Configuración principal de la aplicación
function configurarApp() {
  console.log('Configurando la aplicación...');
  
  // Asegurarse que las notificaciones estén disponibles globalmente
  window.notifications = window.notifications || notifications;
  
  console.log('Sistema de notificaciones configurado:', !!window.notifications);
  
  // Usar EventBus para la coordinación si está disponible
  if (window.AppEventBus) {
    registrarEventosApp();
    
    // Si la app ya fue inicializada antes de este script
    if (window.controladorCharlas && window.controladorMuestras) {
      inicializarUI();
    }
  } else {
    // Fallback si EventBus no está disponible
    console.warn('EventBus no disponible, usando configuración básica');
    inicializarUI();
  }
}

// Registrar eventos de la aplicación
function registrarEventosApp() {
  window.AppEventBus.on('app:inicializada', () => {
    console.log('La aplicación está lista');
    inicializarUI();
  });
  
  window.AppEventBus.on('charlas:cargadas', (charlas) => {
    console.log(`${charlas.length} charlas cargadas correctamente`);
  });
  
  window.AppEventBus.on('seccion:cambio', handleSeccionCambio);
}

// Inicialización de la interfaz de usuario
function inicializarUI() {
  // Inicializar controladores disponibles
  ['controladorCharlas', 'controladorMuestras', 'controladorInscripciones']
    .forEach(controlador => {
      if (window[controlador] && typeof window[controlador].inicializar === 'function') {
        window[controlador].inicializar();
      }
    });
  
  // Mostrar sección inicial
  mostrarSeccion('inicio');
  
  // Configurar formularios
  setupFormEventListeners();
  
  console.log('Interfaz de usuario inicializada');
}

// Manejar cambios de sección específicos
function handleSeccionCambio(seccionId) {
  const acciones = {
    empresas: () => {
      if (window.controladorEmpresas) {
        const categoriaActiva = document.querySelector('.btn-categoria.active')?.dataset.categoria || 'todas';
        window.controladorEmpresas.mostrarEmpresasPorCategoria(categoriaActiva);
      }
    },
    muestras: () => {
      if (window.controladorMuestras) {
        window.controladorMuestras.actualizarMuestras();
      }
    },
    charlas: () => {
      if (window.controladorCharlas?.ultimasCharlas) {
        window.controladorCharlas.actualizarInterfazCharlas(window.controladorCharlas.ultimasCharlas);
      }
    },
    competencias: () => {
      if (window.controladorCompetencias) {
        const categoriaActiva = document.querySelector('.btn-categoria.active[data-competencia]')?.dataset.competencia || 'todas';
        // Usar el nuevo método que muestra todas las competencias sin filtrar
        window.controladorCompetencias.mostrarTodasLasCompetencias();
      }
    },
    inscripcion: () => {
      // Actualizaciones para la sección de inscripción
      if (window.controladorCharlas?.ultimasCharlas) {
        window.controladorCharlas.actualizarSelectoresCharlas(window.controladorCharlas.ultimasCharlas);
      }
      
      if (window.controladorInscripciones) {
        window.controladorInscripciones.cargarOpcionesComoTeEnteraste();
      }
    }
  };
  
  // Ejecutar la acción correspondiente si existe
  if (acciones[seccionId]) {
    acciones[seccionId]();
  }
}

// Configurar los event listeners para formularios
function setupFormEventListeners() {
  // Formulario de inscripción
  const formularioInscripcion = document.querySelector("#inscripcionForm");
  if (formularioInscripcion) {
    // Eliminar listeners previos para evitar duplicados
    const nuevoFormulario = formularioInscripcion.cloneNode(true);
    formularioInscripcion.parentNode.replaceChild(nuevoFormulario, formularioInscripcion);
    
    // Agregar nuevo listener
    nuevoFormulario.addEventListener('submit', procesarEnvioFormulario);
    
    // También listener para el botón como respaldo
    const btnFormulario = document.querySelector("#btn-formulario");
    if (btnFormulario) {
      btnFormulario.addEventListener('click', procesarEnvioFormulario);
    }
  }
}

// Procesar el envío del formulario de inscripción
function procesarEnvioFormulario(evento) {
  evento.preventDefault();
  
  if (window.controladorInscripciones?.procesarInscripcion) {
    const actualizarCharlas = 
      window.controladorCharlas?.inicializar || null;
    
    try {
      console.log("Procesando inscripción...");
      window.controladorInscripciones.procesarInscripcion(evento, actualizarCharlas);
    } catch (error) {
      console.error('Error al procesar la inscripción:', error);
      
      // Usar el sistema de notificaciones si está disponible
      if (window.notifications) {
        window.notifications.error('Error al procesar la inscripción. Ver consola para más detalles.');
      } else {
        // Fallback para notificar error
        console.error('Sistema de notificaciones no disponible, no se pudo mostrar notificación de error');
      }
    }
  } else {
    console.error('La función procesarInscripcion no está disponible');
    
    // Usar el sistema de notificaciones si está disponible
    if (window.notifications) {
      window.notifications.error('Error: No se pudo procesar la inscripción. El controlador no está cargado correctamente.');
    } else {
      // Fallback para notificar error
      console.error('Sistema de notificaciones no disponible, no se pudo mostrar notificación de error');
    }
  }
}

// Función para mostrar secciones - disponible globalmente a través del window
function mostrarSeccion(id) {
  // Usar controlador de secciones si está disponible
  if (window.controladorSecciones) {
    window.controladorSecciones.mostrarSeccion(id);
  } else {
    // Implementación de respaldo
    console.log(`Mostrando sección (fallback): ${id}`);
    
    // Ocultar todas las secciones
    document.querySelectorAll('.section').forEach(section => {
      section.classList.remove('activa');
    });
    
    // Mostrar la sección solicitada
    const seccion = document.getElementById(id);
    if (seccion) {
      seccion.classList.add('activa');
      
      // Cerrar menú móvil si está abierto
      const menuMovil = document.getElementById('main-nav');
      if (menuMovil?.classList.contains('active')) {
        menuMovil.classList.remove('active');
      }
      
      // Acciones específicas por sección
      handleSeccionCambio(id);
    } else {
      console.error(`Sección no encontrada: #${id}`);
    }
  }
}

// Función para mostrar y hacer scroll al formulario
function mostrarFormulario() {
  mostrarSeccion('inscripcion');
  
  setTimeout(() => {
    const formContainer = document.querySelector('.form-container');
    if (formContainer) formContainer.scrollIntoView({ behavior: 'smooth' });
  }, 100);
}

// Función para alternar la visibilidad del menú móvil
function alternarMenu() {
  if (window.controladorSecciones) {
    window.controladorSecciones.alternarMenu();
  } else {
    // Implementación de respaldo
    const menuPrincipal = document.getElementById('main-nav');
    if (menuPrincipal) menuPrincipal.classList.toggle('active');
  }
}

// Función para mostrar empresas por categoría
function mostrarEmpresas(categoria) {
  mostrarSeccion('empresas');
  
  // Actualizar botón activo
  document.querySelectorAll('.btn-categoria').forEach(boton => {
    boton.classList.remove('active');
  });
  
  const botonActivo = document.querySelector(`.btn-categoria[data-categoria="${categoria}"]`);
  if (botonActivo) botonActivo.classList.add('active');
  
  // Usar controlador de empresas si está disponible
  if (window.controladorEmpresas) {
    window.controladorEmpresas.mostrarEmpresasPorCategoria(categoria);
  }
}

// Función para recargar datos manualmente (útil para testing)
function recargarDatos() {
  if (window.AppEventBus && window.utilidades) {
    console.log('Forzando recarga de datos desde data.json...');
    
    // Limpiar cache antes de recargar
    const cacheKeys = [
      'datos_json_cache', 
      'datos_json_timestamp',
      'charlas_cache',
      'empresas_cache',
      'muestras_cache',
      'competencias_cache'
    ];
    
    cacheKeys.forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    
    window.utilidades.cargarDatosJSON().then(datos => {
      window.DATOS = datos;
      
      console.log('Datos recargados:', {
        charlas: datos.charlas?.length || 0,
        empresas: Object.keys(datos.empresas || {}).length,
        muestras: datos.muestras?.length || 0,
        competencias: Object.keys(datos.competencias || {}).length
      });
      
      // Emitir evento para que los controladores se actualicen
      window.AppEventBus.emit('datos:recargados', datos);
      
      // Forzar actualización de la sección actual
      const seccionActiva = document.querySelector('.section.activa');
      if (seccionActiva) {
        const seccionId = seccionActiva.id;
        console.log(`Actualizando sección activa: ${seccionId}`);
        
        // Marcar la sección como no cargada para forzar recarga
        if (window.controladorSecciones?.seccionesCargadas) {
          window.controladorSecciones.seccionesCargadas.delete(seccionId);
        }
        
        // Mostrar la sección nuevamente para recargar datos
        setTimeout(() => mostrarSeccion(seccionId), 100);
      }
      
      console.log('Datos recargados correctamente');
      
      // Notificar al usuario si está disponible el sistema
      if (window.notifications) {
        window.notifications.success('Datos recargados correctamente desde el archivo');
      }
    }).catch(error => {
      console.error('Error al recargar datos:', error);
      if (window.notifications) {
        window.notifications.error('Error al recargar datos: ' + error.message);
      }
    });
  } else {
    console.warn('No se pueden recargar los datos: utilidades o EventBus no disponibles');
  }
}

// Exponer funciones al ámbito global
window.mostrarSeccion = mostrarSeccion;
window.mostrarFormulario = mostrarFormulario;
window.alternarMenu = alternarMenu;
window.mostrarEmpresas = mostrarEmpresas;
window.recargarDatos = recargarDatos;

// Función adicional para debugging desde consola
window.debugCache = function() {
  console.log('=== ESTADO DEL CACHE ===');
  console.log('localStorage:', {
    datos_json_cache: localStorage.getItem('datos_json_cache') ? 'EXISTE' : 'NO EXISTE',
    datos_json_timestamp: localStorage.getItem('datos_json_timestamp'),
    charlas_cache: localStorage.getItem('charlas_cache') ? 'EXISTE' : 'NO EXISTE'
  });
  console.log('sessionStorage:', {
    datos_json_cache: sessionStorage.getItem('datos_json_cache') ? 'EXISTE' : 'NO EXISTE',
    datos_json_timestamp: sessionStorage.getItem('datos_json_timestamp')
  });
  console.log('DATOS actuales:', {
    charlas: window.DATOS?.charlas?.length || 0,
    empresas: Object.keys(window.DATOS?.empresas || {}).length,
    muestras: window.DATOS?.muestras?.length || 0,
    competencias: Object.keys(window.DATOS?.competencias || {}).length
  });
};

// Función para forzar actualización completa
window.forzarActualizacion = function() {
  console.log('=== FORZANDO ACTUALIZACIÓN COMPLETA ===');
  
  // Limpiar todo
  ['localStorage', 'sessionStorage'].forEach(storage => {
    const store = window[storage];
    const keys = Object.keys(store);
    keys.forEach(key => {
      if (key.includes('cache') || key.includes('datos') || key.includes('charlas')) {
        store.removeItem(key);
        console.log(`Eliminado: ${key} de ${storage}`);
      }
    });
  });
  
  // Recargar datos
  recargarDatos();
};

// Reemplazamos el filtrado de competencias con una función que simplemente muestra todas
if (!window.mostrarTodasLasCompetencias) {
  window.mostrarTodasLasCompetencias = () => {
    mostrarSeccion('competencias');
    
    // Si existe controlador de competencias, usarlo
    if (window.controladorCompetencias) {
      window.controladorCompetencias.mostrarTodasLasCompetencias();
    }
  };
}

// Notificar que app.js está listo
document.dispatchEvent(new CustomEvent('app:loaded'));