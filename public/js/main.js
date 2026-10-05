// Sistema centralizado para gestionar los datos y controladores de la aplicación
let DATOS = { charlas: [], empresas: {}, muestras: [], competencias: {} };

// Importar sistema de notificaciones
import notifications from './utils/notifications.js';

// Sistema de eventos para la comunicación entre módulos
const EventBus = {
  events: {},
  on(eventName, fn) {
    this.events[eventName] = this.events[eventName] || [];
    this.events[eventName].push(fn);
    return this;
  },
  off(eventName, fn) {
    if (this.events[eventName]) {
      if (fn) {
        this.events[eventName] = this.events[eventName].filter(f => f !== fn);
      } else {
        delete this.events[eventName];
      }
    }
    return this;
  },
  emit(eventName, data) {
    if (this.events[eventName]) {
      this.events[eventName].forEach(fn => fn(data));
    }
    return this;
  }
};

// Utilidades - Funciones auxiliares comunes
export const utilidades = {
  obtenerElemento: selector => document.querySelector(selector),
  obtenerElementos: selector => document.querySelectorAll(selector),
  generarUUID: () => ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  ),
  guardarDatos: (clave, datos) => localStorage.setItem(clave, JSON.stringify(datos)),
  recuperarDatos: (clave, valorPredeterminado = []) => {
    const datos = localStorage.getItem(clave);
    return datos ? JSON.parse(datos) : valorPredeterminado;
  },
  // Cargar datos desde JSON sin cache para cambios en tiempo real
  async cargarDatosJSON() {
    try {
      // Agregar timestamp y parámetros adicionales para evitar cache del navegador
      const timestamp = Date.now();
      const randomParam = Math.random().toString(36).substring(7);
      const url = `../js/data.json?t=${timestamp}&nocache=${randomParam}&v=${Date.now()}`;
      
      console.log(`Cargando datos desde: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store', // Más agresivo que 'no-cache'
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
      const datos = await response.json();
      
      console.log('Datos cargados desde data.json (sin cache) - tiempo real:', {
        charlas: datos.charlas?.length || 0,
        empresas: Object.keys(datos.empresas || {}).length,
        muestras: datos.muestras?.length || 0,
        competencias: Object.keys(datos.competencias || {}).length
      });
      
      return datos;
    } catch (error) {
      console.error('Error al cargar data.json:', error);
      
      // Fallback completo
      return {
        charlas: [{ id: "default1", titulo: "Charla Predeterminada", horario: "10:00", empresa: "UOCRA", ubicacion: "Aula 1" }],
        empresas: { construccion: [{ nombre: "UOCRA", descripcion: "Fundación para la educación de los trabajadores constructores" }] },
        muestras: [{ numero: "1", muestra: "Muestra Predeterminada", ubicacion: "Entrada Principal" }]
      };
    }
  },
  // Acceso directo al sistema de notificaciones
  notifications
};

// Controlador de secciones - Gestiona la visualización de las diferentes secciones con lazy loading
export const controladorSecciones = {
  seccionesCargadas: new Set(),
  
  async mostrarSeccion(id) {
    utilidades.obtenerElementos('.section').forEach(section => section.classList.remove('activa'));
    
    const seccion = utilidades.obtenerElemento(`#${id}`);
    if (!seccion) {
      console.error(`Sección no encontrada: #${id}`);
      return;
    }
    
    seccion.classList.add('activa');
    
    // Cerrar menú móvil si está abierto
    const menuMovil = utilidades.obtenerElemento("#main-nav");
    if (menuMovil?.classList.contains('active')) menuMovil.classList.remove('active');
    
    // Lazy loading: cargar datos solo cuando se accede a la sección
    await this.cargarSeccionSiEsNecesario(id);
    
    // Notificar cambio
    EventBus.emit('seccion:cambio', id);
  },
  
  async cargarSeccionSiEsNecesario(id) {
    // Evitar cargar la misma sección múltiples veces
    if (this.seccionesCargadas.has(id)) return;
    
    try {
      switch(id) {
        case 'charlas':
          if (window.controladorCharlas?.inicializarParaVisualizacion) {
            await window.controladorCharlas.inicializarParaVisualizacion();
          }
          break;
          
        case 'empresas':
          if (!DATOS.empresas || Object.keys(DATOS.empresas).length === 0) {
            const datos = await utilidades.cargarDatosJSON();
            DATOS.empresas = datos.empresas || {};
          }
          controladorEmpresas.mostrarEmpresasPorCategoria('todas');
          break;
          
        case 'muestras':
          if (!DATOS.muestras || DATOS.muestras.length === 0) {
            const datos = await utilidades.cargarDatosJSON();
            DATOS.muestras = datos.muestras || [];
          }
          controladorMuestras.inicializar();
          break;
          
        case 'competencias':
          if (!DATOS.competencias || Object.keys(DATOS.competencias).length === 0) {
            const datos = await utilidades.cargarDatosJSON();
            DATOS.competencias = datos.competencias || {};
          }
          controladorCompetencias.inicializar();
          break;
          
        case 'inscripcion':
          if (window.controladorInscripciones?.inicializar) {
            await window.controladorInscripciones.inicializar();
          }
          break;
      }
      
      // Marcar como cargada
      this.seccionesCargadas.add(id);
      console.log(`Sección ${id} cargada exitosamente`);
      
    } catch (error) {
      console.error(`Error al cargar sección ${id}:`, error);
      EventBus.emit('seccion:error', { id, error });
    }
  },
  
  async mostrarFormulario() {
    await this.mostrarSeccion('inscripcion');
    const formContainer = utilidades.obtenerElemento('.form-container');
    if (formContainer) formContainer.scrollIntoView({ behavior: 'smooth' });
  },
  
  alternarMenu() {
    const menuPrincipal = utilidades.obtenerElemento("#main-nav");
    if (menuPrincipal) menuPrincipal.classList.toggle('active');
  }
};

// Controlador de charlas - Gestiona las charlas disponibles con caché optimizado
export const controladorCharlas = {
  ultimasCharlas: null,
  cargando: false,
  cache: {
    charlas: null,
    timestamp: null,
    ttl: 5 * 60 * 1000 // 5 minutos en cache
  },
  
  // Método específico para la sección de visualización de charlas (usa data.json)
  async inicializarParaVisualizacion() {
    try {
      // Usar charlas desde data.json únicamente para la visualización
      const charlasConIDs = DATOS.charlas.map(charla => ({
        ...charla,
        id: charla.id || utilidades.generarUUID()
      }));
      
      this.ultimasCharlas = charlasConIDs;
      this.actualizarInterfazCharlas(charlasConIDs);
      EventBus.emit('charlas:cargadas', charlasConIDs);
      console.log('Charlas cargadas desde data.json para visualización');
      return charlasConIDs;
    } catch (error) {
      console.error('Error al cargar charlas desde data.json:', error);
      
      // Fallback con charlas predeterminadas si hay error
      const charlasPredeterminadas = [
        { id: "default1", titulo: "Charla Predeterminada", horario: "10:00", empresa: "UOCRA", ubicacion: "Aula 1", participantes: 0 }
      ];
      
      this.ultimasCharlas = charlasPredeterminadas;
      this.actualizarInterfazCharlas(charlasPredeterminadas);
      EventBus.emit('charlas:error', error);
      return charlasPredeterminadas;
    }
  },

  // Método para inscripciones (consulta el servidor)
  async inicializar() {
    if (this.cargando) return this.ultimasCharlas;
    
    // Verificar cache primero
    if (this.cache.charlas && this.cache.timestamp && 
        (Date.now() - this.cache.timestamp) < this.cache.ttl) {
      console.log('Usando charlas desde cache');
      this.ultimasCharlas = this.cache.charlas;
      this.actualizarInterfazCharlas(this.cache.charlas);
      return this.cache.charlas;
    }
    
    this.cargando = true;
    
    try {
      // Obtener charlas del servidor para inscripciones
      const response = await fetch('/api/inscripcion/charlas');
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }
      
      const charlas = await response.json();
      
      // Si no hay charlas del servidor, usar las predefinidas
      if (!charlas || charlas.length === 0) {
        const charlasConIDs = DATOS.charlas.map(charla => ({
          ...charla,
          id: charla.id || utilidades.generarUUID()
        }));
        
        this.ultimasCharlas = charlasConIDs;
        this.cache.charlas = charlasConIDs;
        this.cache.timestamp = Date.now();
        this.actualizarInterfazCharlas(charlasConIDs);
        EventBus.emit('charlas:cargadas', charlasConIDs);
        console.log('Charlas cargadas desde data.json como fallback para inscripciones');
        return charlasConIDs;
      }
      
      // Guardar en cache las charlas del servidor
      this.ultimasCharlas = charlas;
      this.cache.charlas = charlas;
      this.cache.timestamp = Date.now();
      this.actualizarInterfazCharlas(charlas);
      EventBus.emit('charlas:cargadas', charlas);
      console.log('Charlas cargadas desde servidor para inscripciones');
      return charlas;
    } catch (error) {
      console.error('Error al cargar charlas desde servidor:', error);
      
      // Usar cache si está disponible aunque esté expirado
      if (this.cache.charlas) {
        console.log('Usando charlas desde cache expirado como fallback');
        this.ultimasCharlas = this.cache.charlas;
        this.actualizarInterfazCharlas(this.cache.charlas);
        return this.cache.charlas;
      }
      
      // Fallback final: usar charlas locales
      const charlasLocales = DATOS.charlas.map(charla => ({
        ...charla,
        id: charla.id || utilidades.generarUUID()
      }));
      
      this.ultimasCharlas = charlasLocales;
      this.actualizarInterfazCharlas(charlasLocales);
      EventBus.emit('charlas:error', error);
      console.log('Usando charlas desde data.json como fallback final');
      return charlasLocales;
    } finally {
      this.cargando = false;
    }
  },
  
  actualizarInterfazCharlas(charlas) {
    if (!charlas) return;
    this.actualizarTablaCharlas(charlas);
    this.actualizarSelectoresCharlas(charlas);
  },
  
  actualizarTablaCharlas(charlas) {
    const cuerpoTabla = utilidades.obtenerElemento("#charlas-lista");
    if (!cuerpoTabla) return;
    
    // Usar DocumentFragment para mejor performance
    const fragment = document.createDocumentFragment();
    
    charlas.forEach(charla => {
      const fila = document.createElement("tr");
      
      ["horario", "titulo", "empresa", "ubicacion"].forEach(campo => {
        const celda = document.createElement("td");
        celda.textContent = charla[campo] || '';
        fila.appendChild(celda);
      });
      
      fragment.appendChild(fila);
    });
    
    // Una sola operación DOM
    cuerpoTabla.innerHTML = "";
    cuerpoTabla.appendChild(fragment);
  },
  
  actualizarSelectoresCharlas(charlas) {
    const contenedorCharlas = utilidades.obtenerElemento('#charlas-container');
    if (!contenedorCharlas) return;
    
    // Definimos una capacidad máxima (constante) para las charlas
    const CAPACIDAD_MAXIMA = 50;
    
    // Usar DocumentFragment para batch rendering
    const fragment = document.createDocumentFragment();
    
    // Ordenamos las charlas: primero las que tienen cupo, luego las completas
    const charlasOrdenadas = [...charlas].sort((a, b) => {
      const cupoA = a.capacidad_maxima || CAPACIDAD_MAXIMA;
      const cupoB = b.capacidad_maxima || CAPACIDAD_MAXIMA;
      
      const aCompleta = (a.participantes || 0) >= cupoA;
      const bCompleta = (b.participantes || 0) >= cupoB;
      
      // Primero ordenamos por disponibilidad
      if (aCompleta && !bCompleta) return 1;
      if (!aCompleta && bCompleta) return -1;
      
      // Si ambas tienen el mismo estado de disponibilidad, ordenamos por horario
      return a.horario.localeCompare(b.horario);
    });

    // Separar charlas con cupo y completas
    const charlasConCupo = charlasOrdenadas.filter(c => {
      const cupoMaximo = c.capacidad_maxima || CAPACIDAD_MAXIMA;
      return (c.participantes || 0) < cupoMaximo && 
             c.id !== 'N/A' && 
             c.id !== 'no-charla' && 
             !(c.titulo && c.titulo.toLowerCase().includes('no asistir'));
    });

    const charlasCompletas = charlasOrdenadas.filter(c => {
      const cupoMaximo = c.capacidad_maxima || CAPACIDAD_MAXIMA;
      return (c.participantes || 0) >= cupoMaximo && 
             c.id !== 'N/A' && 
             c.id !== 'no-charla' && 
             !(c.titulo && c.titulo.toLowerCase().includes('no asistir'));
    });

    // Crear checkboxes para charlas disponibles
    charlasConCupo.forEach(charla => {
      const checkboxContainer = this.crearCheckboxCharla(charla, false, CAPACIDAD_MAXIMA);
      fragment.appendChild(checkboxContainer);
    });

    // Crear checkboxes para charlas completas (deshabilitados)
    charlasCompletas.forEach(charla => {
      const checkboxContainer = this.crearCheckboxCharla(charla, true, CAPACIDAD_MAXIMA);
      fragment.appendChild(checkboxContainer);
    });

    // Una sola operación DOM
    contenedorCharlas.innerHTML = '';
    contenedorCharlas.appendChild(fragment);

    // Configurar event listeners después del renderizado
    this.configurarCheckboxNoCharla();
  },

  crearCheckboxCharla(charla, esCompleta, capacidadMaxima) {
    const cupoMaximo = charla.capacidad_maxima || capacidadMaxima;
    const participantes = charla.participantes || 0;
    const cupoDisponible = cupoMaximo - participantes;

    const label = document.createElement('label');
    label.className = `checkbox-label ${esCompleta ? 'charla-completa' : ''}`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'charlas';
    checkbox.value = charla.id;
    checkbox.disabled = esCompleta;

    // Agregar listener para actualizar badges
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        e.target.parentElement.classList.add('selected');
        
        // Desmarcar "no-charla" si se selecciona cualquier otra charla
        const noCharlaCheckbox = utilidades.obtenerElemento('#no-charla');
        if (noCharlaCheckbox) {
          noCharlaCheckbox.checked = false;
          noCharlaCheckbox.parentElement.classList.remove('selected');
        }
      } else {
        e.target.parentElement.classList.remove('selected');
      }
      
      // Llamar al método usando window.controladorCharlas si está disponible
      if (window.controladorCharlas && typeof window.controladorCharlas.actualizarBadgesCharlas === 'function') {
        window.controladorCharlas.actualizarBadgesCharlas();
      }
    });

    const checkmark = document.createElement('span');
    checkmark.className = 'checkmark';

    const charlaInfo = document.createElement('div');
    charlaInfo.className = 'charla-info';

    const titulo = document.createElement('div');
    titulo.className = 'charla-titulo';
    titulo.textContent = charla.titulo;

    const detalles = document.createElement('div');
    detalles.className = 'charla-detalles';
    detalles.textContent = `${charla.horario} - ${charla.empresa} - ${charla.ubicacion}`;

    // Solo mostrar estado si está completa
    if (esCompleta) {
      const estadoInfo = document.createElement('div');
      estadoInfo.className = 'charla-estado-completa';
      estadoInfo.textContent = 'Charla completa';
      charlaInfo.appendChild(estadoInfo);
    }

    charlaInfo.appendChild(titulo);
    charlaInfo.appendChild(detalles);

    label.appendChild(checkbox);
    label.appendChild(checkmark);
    label.appendChild(charlaInfo);

    return label;
  },

  configurarCheckboxNoCharla() {
    const noCharlaCheckbox = utilidades.obtenerElemento('#no-charla');
    const otrosCheckboxes = utilidades.obtenerElementos('input[name="charlas"]:not(#no-charla)');

    if (noCharlaCheckbox) {
      noCharlaCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          // Desmarcar todos los otros checkboxes
          otrosCheckboxes.forEach(checkbox => {
            checkbox.checked = false;
            checkbox.parentElement.classList.remove('selected');
          });
        }
        this.actualizarBadgesCharlas();
      });
    }

    // Agregar listener a otros checkboxes para desmarcar "no-charla"
    otrosCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked && noCharlaCheckbox) {
          noCharlaCheckbox.checked = false;
          noCharlaCheckbox.parentElement.classList.remove('selected');
        }
        
        // Actualizar clase visual del checkbox
        if (e.target.checked) {
          e.target.parentElement.classList.add('selected');
        } else {
          e.target.parentElement.classList.remove('selected');
        }
        
        // Usar referencia global si es necesario
        if (window.controladorCharlas && typeof window.controladorCharlas.actualizarBadgesCharlas === 'function') {
          window.controladorCharlas.actualizarBadgesCharlas();
        }
      });
    });

    // Inicializar badges
    setTimeout(() => {
      if (window.controladorCharlas && typeof window.controladorCharlas.actualizarBadgesCharlas === 'function') {
        window.controladorCharlas.actualizarBadgesCharlas();
      }
    }, 100);
  },

  // Optimización: debounce para evitar múltiples actualizaciones rápidas
  _debounceTimer: null,
  
  actualizarBadgesCharlas() {
    // Debounce para optimizar rendimiento
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    
    this._debounceTimer = setTimeout(() => {
      this._actualizarBadgesCharlasInmediato();
    }, 16); // ~60fps
  },
  
  _actualizarBadgesCharlasInmediato() {
    const badgesContainer = utilidades.obtenerElemento('#charlas-badges');
    const seleccionadasContainer = utilidades.obtenerElemento('#charlas-seleccionadas');
    
    if (!badgesContainer || !seleccionadasContainer) return;

    // Obtener checkboxes seleccionados
    const checkboxesSeleccionados = utilidades.obtenerElementos('input[name="charlas"]:checked');
    
    if (checkboxesSeleccionados.length === 0) {
      // Mostrar placeholder cuando no hay selecciones
      badgesContainer.innerHTML = '<div class="charlas-seleccionadas-placeholder">Ninguna charla seleccionada</div>';
      seleccionadasContainer.classList.remove('has-selections');
      return;
    }

    // Marcar que hay selecciones
    seleccionadasContainer.classList.add('has-selections');

    // Usar DocumentFragment para mejor performance
    const fragment = document.createDocumentFragment();
    
    // Crear badges para cada charla seleccionada
    checkboxesSeleccionados.forEach(checkbox => {
      const badge = this.crearBadgeCharla(checkbox);
      fragment.appendChild(badge);
    });
    
    // Una sola operación DOM
    badgesContainer.innerHTML = '';
    badgesContainer.appendChild(fragment);
  },

  crearBadgeCharla(checkbox) {
    const badge = document.createElement('div');
    badge.className = 'charla-badge';
    
    if (checkbox.value === 'no-charla') {
      badge.classList.add('no-charla');
      badge.innerHTML = `
        <span class="charla-badge-content">
          <span class="charla-badge-titulo">No asistir a charlas</span>
        </span>
        <span class="charla-badge-remove" data-charla-id="no-charla"></span>
      `;
    } else {
      // Buscar información de la charla en los datos cargados
      const charlaInfo = this.obtenerInfoCharla(checkbox.value);
      
      badge.innerHTML = `
        <span class="charla-badge-content">
          <span class="charla-badge-titulo">${charlaInfo.titulo}</span>
          <span class="charla-badge-detalles">${charlaInfo.horario} - ${charlaInfo.empresa}</span>
        </span>
        <span class="charla-badge-remove" data-charla-id="${checkbox.value}"></span>
      `;
    }

    // Agregar listener para remover badge
    const removeBtn = badge.querySelector('.charla-badge-remove');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removerCharlaSeleccionada(removeBtn.dataset.charlaId);
    });

    return badge;
  },

  obtenerInfoCharla(charlaId) {
    // Buscar en las charlas cargadas
    if (this.ultimasCharlas) {
      const charla = this.ultimasCharlas.find(c => c.id === charlaId);
      if (charla) {
        return {
          titulo: charla.titulo || 'Charla sin título',
          horario: charla.horario || '',
          empresa: charla.empresa || ''
        };
      }
    }

    // Fallback si no se encuentra la información
    return {
      titulo: `Charla ${charlaId}`,
      horario: '',
      empresa: ''
    };
  },

  removerCharlaSeleccionada(charlaId) {
    const checkbox = utilidades.obtenerElemento(`input[name="charlas"][value="${charlaId}"]`);
    if (checkbox) {
      checkbox.checked = false;
      checkbox.parentElement.classList.remove('selected');
      this.actualizarBadgesCharlas();
      
      // Trigger change event para otros listeners
      checkbox.dispatchEvent(new Event('change'));
    }
  },
  
  aplicarEstiloPersonalizado(selector) {
    // Obtener el contenedor padre para manipular el estilo
    const contenedor = selector.parentElement;
    if (!contenedor) return;
    
    // Añadir clase para el estilizado personalizado
    selector.classList.add('charlas-select-personalizado');
    
    // Asegurar que tenga el atributo para que muestre el ícono nativo de desplegable
    selector.style.appearance = 'menulist';
    
    // Asegurar que se apliquen los estilos cuando cambia la selección
    selector.addEventListener('change', () => {
      const opcionSeleccionada = selector.options[selector.selectedIndex];
      
      // Restablecer clases
      selector.classList.remove('tiene-seleccion', 'seleccion-disponible', 'seleccion-completa', 'seleccion-default');
      
      if (selector.value) {
        selector.classList.add('tiene-seleccion');
        
        if (selector.value === 'no-charla') {
          selector.classList.add('seleccion-default');
        } else if (opcionSeleccionada.classList.contains('charla-completa')) {
          selector.classList.add('seleccion-completa');
        } else if (opcionSeleccionada.classList.contains('charla-disponible')) {
          selector.classList.add('seleccion-disponible');
        }
      }
    });
    
    // Disparar el evento change para aplicar estilos iniciales
    selector.dispatchEvent(new Event('change'));
  }
};

// Controlador de empresas - Gestiona la visualización de empresas por categoría
export const controladorEmpresas = {
  mostrarEmpresasPorCategoria(categoria = 'todas') {
    // Actualizar botón activo
    utilidades.obtenerElementos('.btn-categoria').forEach(boton => boton.classList.remove('active'));
    
    const botonActivo = utilidades.obtenerElemento(`.btn-categoria[data-categoria="${categoria}"]`);
    if (botonActivo) botonActivo.classList.add('active');
    
    const contenedor = utilidades.obtenerElemento("#empresas-lista");
    if (!contenedor) return;
    
    try {
      if (!DATOS || !DATOS.empresas) {
        contenedor.innerHTML = "<p>No hay datos de empresas disponibles</p>";
        return;
      }
      
      // Usar DocumentFragment para mejor performance
      const fragment = document.createDocumentFragment();
      
      if (categoria === 'todas') {
        // Mostrar todas las empresas
        Object.values(DATOS.empresas).forEach(empresasCategoria => {
          if (Array.isArray(empresasCategoria)) {
            empresasCategoria.forEach(empresa => fragment.appendChild(this.crearTarjetaEmpresa(empresa)));
          }
        });
      } else {
        // Mostrar por categoría específica
        const empresas = DATOS.empresas[categoria] || [];
        if (empresas.length === 0) {
          contenedor.innerHTML = `<p>No hay empresas en la categoría: ${categoria}</p>`;
          return;
        } else {
          empresas.forEach(empresa => fragment.appendChild(this.crearTarjetaEmpresa(empresa)));
        }
      }
      
      // Una sola operación DOM
      contenedor.innerHTML = "";
      contenedor.appendChild(fragment);
      
      EventBus.emit('empresas:mostradas', categoria);
    } catch (error) {
      console.error("Error al mostrar empresas:", error);
      contenedor.innerHTML = "<p>Error al cargar las empresas</p>";
      EventBus.emit('empresas:error', error);
    }
  },
  
  crearTarjetaEmpresa(empresa) {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'empresa-card';
    
    // Solo mostrar imagen si la empresa tiene logo
    const logoHtml = empresa.logo ? 
      `<img src="${empresa.logo}" alt="Logo de ${empresa.nombre}" class="empresa-logo" onerror="this.style.display='none';" />` : 
      '';
    
    tarjeta.innerHTML = `
      ${logoHtml}
      <p><strong>${empresa.nombre}</strong></p>
      <p>${empresa.descripcion || ''}</p>
      ${empresa.url ? `<a href="${empresa.url}" target="_blank" class="btn-visitar">Visitar sitio web</a>` : ''}
    `;
    
    // Hacer la tarjeta clickeable si hay URL
    if (empresa.url) {
      tarjeta.style.cursor = 'pointer';
      tarjeta.addEventListener('click', (e) => {
        if (!e.target.classList.contains('btn-visitar')) {
          window.open(empresa.url, '_blank');
        }
      });
    }
    
    return tarjeta;
  }
};

// Controlador de muestras/stands
export const controladorMuestras = {
  inicializar() {
    this.actualizarMuestras();
  },
  
  actualizarMuestras() {
    const contenedorStands = utilidades.obtenerElemento("#stands-container");
    if (!contenedorStands) return;
    
    try {
      if (!DATOS?.muestras?.length) {
        contenedorStands.innerHTML = "<p>No hay muestras disponibles</p>";
        return;
      }
      
      // Usar DocumentFragment para mejor performance
      const fragment = document.createDocumentFragment();
      
      DATOS.muestras.forEach(stand => {
        fragment.appendChild(this.crearElementoStand(stand));
      });
      
      // Una sola operación DOM
      contenedorStands.innerHTML = "";
      contenedorStands.appendChild(fragment);
      
      EventBus.emit('muestras:actualizadas', DATOS.muestras);
    } catch (error) {
      console.error("Error al mostrar muestras:", error);
      contenedorStands.innerHTML = "<p>Error al cargar las muestras</p>";
      EventBus.emit('muestras:error', error);
    }
  },
  
  crearElementoStand(stand) {
    const standItem = document.createElement('div');
    standItem.className = 'stand-item';
    standItem.innerHTML = `
      <div class="stand-number">${stand.numero}</div>
      <div class="stand-info">
        <h4>${stand.muestra}</h4>
        <p>${stand.ubicacion}</p>
      </div>
    `;
    return standItem;
  }
};

// Controlador de competencias
export const controladorCompetencias = {
  competenciasActuales: null,
  
  inicializar() {
    if (!DATOS?.competencias) {
      console.error('No hay datos de competencias disponibles');
      return;
    }
    
    this.mostrarTodasLasCompetencias();
  },
  
  mostrarTodasLasCompetencias() {
    const contenedor = utilidades.obtenerElemento("#competencias-lista");
    if (!contenedor) return;
    
    try {
      let competenciasAMostrar = [];
      
      // Mostrar todas las competencias
      Object.values(DATOS.competencias).forEach(categoriasComp => {
        if (Array.isArray(categoriasComp)) {
          competenciasAMostrar = [...competenciasAMostrar, ...categoriasComp];
        }
      });
      
      if (competenciasAMostrar.length === 0) {
        contenedor.innerHTML = `<p class="no-competencias">No hay competencias disponibles</p>`;
        return;
      }
      
      // Usar DocumentFragment para mejor performance
      const fragment = document.createDocumentFragment();
      
      competenciasAMostrar.forEach(competencia => {
        fragment.appendChild(this.crearTarjetaCompetencia(competencia));
      });
      
      // Una sola operación DOM
      contenedor.innerHTML = "";
      contenedor.appendChild(fragment);
      
      this.competenciasActuales = competenciasAMostrar;
      EventBus.emit('competencias:mostradas', 'todas');
    } catch (error) {
      console.error("Error al mostrar competencias:", error);
      contenedor.innerHTML = "<p>Error al cargar las competencias</p>";
      EventBus.emit('competencias:error', error);
    }
  },
  
  crearTarjetaCompetencia(competencia) {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'competencia-card';
    
    // Solo mostrar imagen si la competencia tiene imagen
    const imagenHtml = competencia.imagen ? 
      `<div class="competencia-imagen">
        <img src="${competencia.imagen}" 
             alt="${competencia.titulo}" 
             onerror="this.parentElement.style.display='none';">
      </div>` : '';
    
    tarjeta.innerHTML = `
      ${imagenHtml}
      <div class="competencia-info">
        <h3>${competencia.titulo}</h3>
        <p class="competencia-descripcion">${competencia.descripcion || 'Sin descripción disponible'}</p>
        <div class="competencia-detalles">
          <p><i class="fas fa-clock"></i> <strong>Horario:</strong> ${competencia.horario}</p>
          <p><i class="fas fa-map-marker-alt"></i> <strong>Ubicación:</strong> ${competencia.ubicacion}</p>
        </div>
      </div>
    `;
    
    return tarjeta;
  }
};

// Controlador de inscripciones - Gestiona las inscripciones a charlas
export const controladorInscripciones = {
  async cargarOpcionesComoTeEnteraste() {
    try {
      const response = await fetch('/api/inscripcion/como-te-enteraste');
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }
      
      const opciones = await response.json();
      const selector = utilidades.obtenerElemento('#como-te-enteraste');
      if (!selector) return;
      
      // Conservar la opción seleccionada actual
      const valorActual = selector.value;
      selector.innerHTML = '';
      
      // Opción predeterminada
      const opcionPredeterminada = document.createElement('option');
      opcionPredeterminada.value = '';
      opcionPredeterminada.textContent = '¿Cómo te enteraste de este evento?';
      opcionPredeterminada.selected = true;
      opcionPredeterminada.disabled = true;
      selector.appendChild(opcionPredeterminada);
      
      // Agregar opciones
      opciones.forEach(opcion => {
        const elemento = document.createElement('option');
        elemento.value = opcion.id || opcion.descripcion;
        elemento.textContent = opcion.descripcion;
        selector.appendChild(elemento);
      });
      
      if (valorActual) selector.value = valorActual;
      
      EventBus.emit('opciones:cargadas', opciones);
      return opciones;
    } catch (error) {
      console.error('Error al cargar opciones de cómo te enteraste:', error);
      
      // Opciones predeterminadas en caso de error
      const opcionesPredeterminadas = [
        { id: 'RS01', descripcion: 'Redes Sociales' },
        { id: 'AM02', descripcion: 'Amigo/Familiar' },
        { id: 'EM03', descripcion: 'Email' },
        { id: 'WEB4', descripcion: 'Sitio Web' },
        { id: 'OT05', descripcion: 'Otro' }
      ];
      
      // Actualizar el selector con opciones predeterminadas
      const selector = utilidades.obtenerElemento('#como-te-enteraste');
      if (!selector) return opcionesPredeterminadas;
      
      const valorActual = selector.value;
      selector.innerHTML = '';
      
      const opcionPredeterminada = document.createElement('option');
      opcionPredeterminada.value = '';
      opcionPredeterminada.textContent = '¿Cómo te enteraste de este evento?';
      opcionPredeterminada.selected = true;
      opcionPredeterminada.disabled = true;
      selector.appendChild(opcionPredeterminada);
      
      opcionesPredeterminadas.forEach(opcion => {
        const elemento = document.createElement('option');
        elemento.value = opcion.id;
        elemento.textContent = opcion.descripcion;
        selector.appendChild(elemento);
      });
      
      if (valorActual) selector.value = valorActual;
      
      EventBus.emit('opciones:error', error);
      return opcionesPredeterminadas;
    }
  },
  
  async procesarInscripcion(evento, callback) {
    evento.preventDefault();
    
    const formulario = utilidades.obtenerElemento('#inscripcionForm');
    if (!formulario) {
      console.error('No se encontró el formulario de inscripción');
      return;
    }
    
    try {
      const btnSubmit = utilidades.obtenerElemento('#btn-formulario');
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Enviando...';
      }
      
      // Recopilar los datos del formulario
      const nombre = utilidades.obtenerElemento('#nombre').value.trim();
      const apellido = utilidades.obtenerElemento('#apellido').value.trim();
      const dni = utilidades.obtenerElemento('#dni').value.trim();
      const email = utilidades.obtenerElemento('#email').value.trim();
      const como_te_enteraste = utilidades.obtenerElemento('#como-te-enteraste').value;
      const charlaId = utilidades.obtenerElemento('#charla').value;
      
      // Validar datos mínimos
      if (!nombre || !apellido || !email || !dni || !como_te_enteraste || !charlaId) {
        notifications.warning('Por favor, completa todos los campos obligatorios', {
          title: 'Campos incompletos',
          showConfirmButton: true,
          confirmButtonText: 'Entendido',
          backdrop: true
        });
        
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.textContent = 'Enviar';
        }
        return;
      }
      
      // Validaciones simples
      if (!email.includes('@') || !email.includes('.')) {
        notifications.warning('Por favor ingresa un email válido', {
          title: 'Email inválido',
          showConfirmButton: true,
          confirmButtonText: 'Entendido',
          backdrop: true
        });
        
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.textContent = 'Enviar';
        }
        return;
      }
      
      if (!/^\d+$/.test(dni)) {
        notifications.warning('El DNI debe contener solo números', {
          title: 'DNI inválido', 
          showConfirmButton: true,
          confirmButtonText: 'Entendido',
          backdrop: true
        });
        
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.textContent = 'Enviar';
        }
        return;
      }
      
      // Datos para enviar
      const datosInscripcion = {
        id: utilidades.generarUUID(),
        nombre, apellido, dni, email, como_te_enteraste, charla: charlaId,
        fecha: new Date().toISOString()
      };
      
      // Enviar al servidor
      const response = await fetch('/api/inscripcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosInscripcion)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        // Obtener el mensaje de error específico del servidor
        const mensajeError = errorData.mensaje || errorData.error || 'Error en la inscripción';
        console.error('Error del servidor:', errorData);
        
        // Determinar el tipo de error para mostrar un mensaje apropiado
        let tituloError = 'Error de inscripción';
        let mensajeUsuario = mensajeError;
        
        // Personalizar el mensaje según el tipo de error
        if (mensajeError.toLowerCase().includes('dni')) {
          tituloError = 'DNI ya registrado';
          mensajeUsuario = 'Este DNI ya está registrado en el sistema.';
        } else if (mensajeError.toLowerCase().includes('email')) {
          tituloError = 'Email ya registrado';
          mensajeUsuario = 'Este email ya está registrado en el sistema.';
        } else if (mensajeError.toLowerCase().includes('charla')) {
          tituloError = 'Problema con la charla';
          mensajeUsuario = 'La charla seleccionada no está disponible o ha alcanzado su capacidad máxima.';
        }
        
        notifications.error(mensajeUsuario, {
          title: tituloError,
          showConfirmButton: true,
          confirmButtonText: 'Entendido',
          backdrop: true
        });
        
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.textContent = 'Enviar';
        }
        
        // Importante: retornamos aquí para evitar mostrar el segundo error
        return;
      }
      
      const resultado = await response.json();
      
      // Éxito
      notifications.success('¡Inscripción exitosa! Te esperamos en el evento.', {
        title: '¡Enhorabuena!',
        duration: 6000,
        showConfirmButton: true,
        confirmButtonText: 'Aceptar',
        backdrop: true,
        callback: () => {
          // Volver a página de inicio cuando el usuario cierra la notificación
          utilidades.obtenerElemento('#inicio')?.scrollIntoView({ behavior: 'smooth' });
        }
      });
      
      formulario.reset();
      
      if (typeof callback === 'function') callback();
      
      EventBus.emit('inscripcion:exitosa', resultado);
    } catch (error) {
      // Registrar el error completo en la consola para los desarrolladores
      console.error('Error al procesar la inscripción:', error);
      
      // Solo mostrar error de conexión si no se ha mostrado ya un error específico
      if (error.name === 'TypeError') {
        notifications.error('No se pudo procesar la inscripción. Comprueba tu conexión e inténtalo más tarde.', {
          title: 'Error de conexión',
          duration: 8000,
          showConfirmButton: true,
          confirmButtonText: 'Entendido',
          backdrop: true
        });
      }
      
      EventBus.emit('inscripcion:error', error);
    } finally {
      const btnSubmit = utilidades.obtenerElemento('#btn-formulario');
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Enviar';
      }
    }
  }
};

// Inicialización de la aplicación
let appInicializada = false;

async function inicializarApp() {
  if (appInicializada) return;
  
  try {
    // Limpiar TODO el cache relacionado para permitir cambios en tiempo real
    const todosLosCacheKeys = [
      'datos_json_cache', 
      'datos_json_timestamp',
      // También limpiar cualquier otro cache que pueda interferir
      'charlas_cache',
      'empresas_cache',
      'muestras_cache',
      'competencias_cache'
    ];
    
    todosLosCacheKeys.forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key); // También limpiar sessionStorage
    });
    
    console.log('Todo el cache limpiado para permitir cambios en tiempo real');
    
    // Cargar datos desde data.json
    DATOS = await utilidades.cargarDatosJSON();
    
    // Exponer controladores globalmente
    window.controladorEmpresas = controladorEmpresas;
    window.controladorMuestras = controladorMuestras;
    window.controladorCharlas = controladorCharlas;
    window.controladorSecciones = controladorSecciones;
    window.controladorInscripciones = controladorInscripciones;
    window.controladorCompetencias = controladorCompetencias;
    window.AppEventBus = EventBus;
    
    // Hacer accesible el sistema de notificaciones globalmente
    window.notifications = notifications;
    
    // Listener para recarga de datos en tiempo real
    EventBus.on('datos:recargados', (nuevosDatos) => {
      console.log('Actualizando datos globales tras recarga...');
      DATOS = nuevosDatos;
      
      // Limpiar cache de secciones para forzar recarga
      controladorSecciones.seccionesCargadas.clear();
      
      // Actualizar controladores con nuevos datos si están inicializados
      try {
        if (controladorEmpresas) {
          const categoriaActiva = document.querySelector('.btn-categoria.active')?.dataset.categoria || 'todas';
          controladorEmpresas.mostrarEmpresasPorCategoria(categoriaActiva);
        }
        
        if (controladorMuestras) {
          controladorMuestras.actualizarMuestras();
        }
        
        if (controladorCompetencias) {
          controladorCompetencias.mostrarTodasLasCompetencias();
        }
        
        // Para charlas, actualizar tanto visualización como inscripciones
        if (controladorCharlas) {
          controladorCharlas.ultimasCharlas = null; // Limpiar cache
          controladorCharlas.cache.charlas = null; // Limpiar cache del controlador
          
          // Si estamos en la sección de charlas, actualizar
          const seccionCharlas = document.querySelector('#charlas.activa');
          if (seccionCharlas) {
            controladorCharlas.inicializarParaVisualizacion();
          }
          
          // Si estamos en inscripción, actualizar selectores
          const seccionInscripcion = document.querySelector('#inscripcion.activa');
          if (seccionInscripcion) {
            controladorCharlas.inicializar();
          }
        }
        
        console.log('Controladores actualizados con nuevos datos');
      } catch (error) {
        console.error('Error al actualizar controladores:', error);
      }
    });
    
    // Inicializar controladores
    await controladorCharlas.inicializar();
    controladorMuestras.inicializar();
    controladorCompetencias.inicializar();
    await controladorInscripciones.cargarOpcionesComoTeEnteraste();
    
    // Definir funciones globales si no existen
    if (!window.mostrarSeccion) window.mostrarSeccion = id => controladorSecciones.mostrarSeccion(id);
    if (!window.mostrarFormulario) window.mostrarFormulario = () => controladorSecciones.mostrarFormulario();
    if (!window.alternarMenu) window.alternarMenu = () => controladorSecciones.alternarMenu();
    if (!window.mostrarEmpresas) window.mostrarEmpresas = categoria => controladorEmpresas.mostrarEmpresasPorCategoria(categoria);
    // Ya no se expone filtrarCompetencias globalmente, ahora usamos mostrarTodasLasCompetencias
    if (!window.mostrarTodasLasCompetencias) window.mostrarTodasLasCompetencias = () => controladorCompetencias.mostrarTodasLasCompetencias();
    
    // Marcar como inicializada y notificar
    appInicializada = true;
    EventBus.emit('app:inicializada', true);
    console.log('Aplicación inicializada correctamente');
  } catch (error) {
    console.error('Error al inicializar la aplicación:', error);
    EventBus.emit('app:error', error);
  }
}

// Inicializar cuando se carga el documento
document.addEventListener('DOMContentLoaded', inicializarApp);

// Exportar EventBus
export { EventBus };