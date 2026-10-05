// Módulo para gestion de inscripciones
import { utilidades } from './main.js'
import notifications from './utils/notifications.js'

// Crear el controlador con namespace propio para evitar conflictos
const InscripcionesController = {
	// Estado interno
	procesando: false,

	// Cache para opciones - Optimizado
	_opcionesCache: {
		data: null,
		timestamp: null,
		ttl: 10 * 60 * 1000 // 10 minutos
	},

	/**
	 * Procesar una nueva inscripcion
	 * @param {Event} evento - Evento del formulario
	 * @param {Function} actualzarCharlas - Callback para actualizar lista de charlas
	 */

	async procesarInscripcion(evento, actualzarCharlas) {
		evento.preventDefault();

		// Evitar multiples envíos
		if (this.procesando) return;
		this.procesando = true;

		try {
			console.log('Iniciando proceso de inscripción');

			// Recopilar los datos del formulario
			const formData = this.recompilarDatosFormulario();
			if (!formData) {
				this.procesando = false;
				return
			}

			// Notificar generación de inscripción
			if (window.EventBus) {
				window.EventBus.emit('inscripcion:generada',{
					nombre: formData.nombre,
					apellido: formData.apellido,
					dni: formData.dni,
					charlas: formData.charlas
				});
			}

			// Mostrar indicador de carga
			this.actualizarEstadoBoton(true, 'Inscribiendote...')

			// Llamamos directamente al fetch para procesar la respuesta en un solo lugar
			// Implementar timeout y retry para mejorar la confiabilidad
			const fetchWithTimeoutAndRetry = async (url, options, timeout = 30000, maxRetries = 2) => {
				let lastError;
				
				for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
					try {
						const controller = new AbortController();
						const timeoutId = setTimeout(() => controller.abort(), timeout);
						
						console.log(`Intento ${attempt}/${maxRetries + 1} de inscripción`);
						
						const response = await fetch(url, {
							...options,
							signal: controller.signal
						});
						
						clearTimeout(timeoutId);
						return response;
					} catch (error) {
						lastError = error;
						
						if (error.name === 'AbortError') {
							console.warn(`Intento ${attempt} cancelado por timeout`);
							lastError = new Error('La solicitud tardó demasiado tiempo. Por favor, intenta nuevamente.');
						} else if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
							console.warn(`Intento ${attempt} falló por error de red:`, error.message);
						} else {
							console.warn(`Intento ${attempt} falló:`, error.message);
						}
						
						// No reintentar en el último intento
						if (attempt < maxRetries + 1) {
							const delay = Math.min(1000 * attempt, 3000); // Backoff exponencial limitado a 3s
							console.log(`Reintentando en ${delay}ms...`);
							await new Promise(resolve => setTimeout(resolve, delay));
						}
					}
				}
				
				throw lastError;
			};

			const response = await fetchWithTimeoutAndRetry('/api/inscripcion', {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					'Accept': 'application/json'
				},
				body: JSON.stringify(formData)
			}, 30000); // 30 segundos de timeout

			// Registrar la petición
			console.log('POST /api/inscripcion - Status:', response.status);
			
			if (!response.ok) {
				// Si la respuesta no es exitosa, manejamos el error aqui
				let errorData;
				try {
					errorData = await response.json();
				} catch (parseError) {
					console.error('Error al parsear respuesta de error:', parseError);
					errorData = { mensaje: 'Error de comunicación con el servidor' };
				}

				const errorMsg = errorData.mensaje || errorData.error || 'Error en la inscripción';

				console.error('Error en la respuesta del servidor', {
					status: response.status,
					error: errorMsg,
					errorData
				});

				// Mostrar mensaje específico según el tipo de error y código de estado
				let tituloError = 'Error de inscripción';
				let mensajeUsuario = errorMsg;

				if (response.status === 409) {
					// Conflictos (DNI duplicado, email duplicado, charla sin cupos)
					if (errorMsg.toLowerCase().includes('dni')) {
						tituloError = 'DNI ya registrado';
						mensajeUsuario = 'Este DNI ya está registrado en el sistema.';
					} else if (errorMsg.toLowerCase().includes('email')) {
						tituloError = 'Email ya registrado';
						mensajeUsuario = 'Este email ya está registrado en el sistema.';
					} else if (errorMsg.toLowerCase().includes('capacidad') || errorMsg.toLowerCase().includes('cupo')) {
						tituloError = 'Charla sin cupos';
						mensajeUsuario = 'La charla seleccionada ha alcanzado su capacidad máxima. Por favor, selecciona otra charla.';
					}
				} else if (response.status === 400) {
					// Errores de validación
					tituloError = 'Datos incorrectos';
					if (errorMsg.toLowerCase().includes('campos')) {
						mensajeUsuario = 'Por favor, completa todos los campos obligatorios.';
					} else if (errorMsg.toLowerCase().includes('charla')) {
						mensajeUsuario = 'La charla seleccionada no es válida. Por favor, selecciona otra charla.';
					}
				} else if (response.status >= 500) {
					// Errores del servidor
					tituloError = 'Error del servidor';
					mensajeUsuario = 'Ocurrió un problema en el servidor. Por favor, intenta nuevamente en unos momentos.';
				}

				notifications.error(mensajeUsuario, {
					duration: 8000,
					title: tituloError,
					showConfirmButton: true,
					backdrop: true
				});
				
				throw new Error('HANDLED_' + errorMsg); // Prefijo para identificar errores ya manejados
			}

			// Si llegamos aqui, la respuesta fue exitosa
			const responseData = await response.json();
			console.log('Inscripción procesada correctamente por el servidor', {
				id: responseData.id,
				charlasInscritas: responseData.charlasInscritas
			});

			const numCharlas = responseData.charlasInscritas ? responseData.charlasInscritas.length : 0;
			console.log('Inscripción completada exitosamente', { 
				charlasInscritas: responseData.charlasInscritas,
				cantidad: numCharlas 
			});
			
			const mensajeExito = numCharlas > 1 
				? `¡Inscripción exitosa! Te has registrado en ${numCharlas} charlas.`
				: '¡Inscripción exitosa! Tu registro ha sido confirmado.';
				
			notifications.success(mensajeExito, {
				title: '¡Enhorabuena!',
				duration: 6000,
				showConfirmButton: true,
				confirmButtonText: 'Aceptar',
				backdrop: true,
				callback: () => {
					// Volver a la página de inicio cuando el usuario cierra la notificación
					utilidades.obtenerElemento('#inicio')?.scrollIntoView({behavior: 'smooth'});
				}
			});

			this.limpiarFormulario();

			// Actualizar charlas si es necesario
			if(responseData.charlasInscritas && responseData.charlasInscritas.length > 0 && typeof actualizarCharlas === 'function') {
				console.log('Actualizando lista de charlas');
				actualizarCharlas();
			}

			utilidades.obtenerElemento('#inicio')?.scrollIntoView({behavior: 'smooth'});
		} catch (error) {
			//Solo registramos el error pero no mostramos el popup si ya fue mostrado
			if (!error.message.startsWith('HANDLED_')) {
				console.error('Error al procesar la inscripción', {
					message: error.message,
					stack: error.stack,
					name: error.name
				});

				// Determinar el tipo de error y mostrar mensaje apropiado
				let tituloError = 'Error de conexión';
				let mensajeError = 'No se pudo procesar la inscripción. Comprueba tu conexión e inténtalo nuevamente.';

				if (error.message.includes('tardó demasiado tiempo')) {
					tituloError = 'Tiempo de espera agotado';
					mensajeError = 'La solicitud tardó demasiado tiempo. Esto puede deberse a una conexión lenta. Por favor, intenta nuevamente.';
				} else if (error.name === 'TypeError' && error.message.includes('fetch')) {
					tituloError = 'Error de red';
					mensajeError = 'No se pudo conectar con el servidor. Verifica tu conexión a internet e intenta nuevamente.';
				} else if (error.message.includes('Failed to fetch')) {
					tituloError = 'Error de conexión';
					mensajeError = 'No se pudo conectar con el servidor. Verifica tu conexión a internet e intenta nuevamente.';
				}

				notifications.error(mensajeError, {
					title: tituloError,
					duration: 8000,
					showConfirmButton: true,
					confirmButtonText: 'Entendido',
					backdrop: true
				});
			}
		} finally {
			// Restaura el estado del boton
			this.actualizarEstadoBoton(false, 'Inscribirme');
			this.procesando = false;
			console.log('Proceso de inscripción finalizado')
		}
	},
	/**
	 * Recopila y valida los datos del formulario
	 * @returns { Object|null }
	 */

	recompilarDatosFormulario() {
		// Obtener charlas seleccionadas
		const charlasSeleccionadas = [];
		const checkboxesCharlas = utilidades.obtenerElementos('input[name="charlas"]:checked');
		
		checkboxesCharlas.forEach(checkbox => {
			charlasSeleccionadas.push(checkbox.value);
		});

		// Datos personales
		const nombre = utilidades.obtenerElemento('#nombre')?.value?.trim() || '';
		const apellido = utilidades.obtenerElemento('#apellido')?.value?.trim() || '';
		const dni = utilidades.obtenerElemento('#dni')?.value?.trim() || '';
		const email = utilidades.obtenerElemento('#email')?.value?.trim() || '';
		const como_te_enteraste = utilidades.obtenerElemento('#como-te-enteraste')?.value?.trim() || '';

		// Validar campos obligatorios
		if (!nombre || !apellido || !dni || !email || !como_te_enteraste) {
			console.warn('Campos obligatorios incompletos', {
				nombre: !!nombre,
				apellido: !!apellido,
				dni: !!dni,
				email: !!email,
				como_te_enteraste: !!como_te_enteraste
			});
			notifications.warning('Por favor completar todos los campos obligatorios');
			return null;
		}

		// Validar que se haya seleccionado al menos una charla
		if (charlasSeleccionadas.length === 0) {
			console.warn('No se seleccionó ninguna charla');
			notifications.warning('Por favor selecciona al menos una charla o marca "No deseo asistir a ninguna charla"');
			return null;
		}

		// Validar email
		if (!this.validarEmail(email)) {
			console.warn('Email invalido', { email });
			notifications.warning('Por favor ingresa un email valido');
			return null
		}

		// Validar DNI (Solo números)
		if (!this.validarDNI(dni)) {
			console.warn('DNI inválido', { dni });
			notifications.warning('El DNI debe contener solo números');
			return null
		}

		// Retornar objeto con datos válidos
		console.log('Datos de formulario recopilados correctamente', {
			charlasSeleccionadas: charlasSeleccionadas.length
		});
		return {
			id: utilidades.generarUUID(),
			nombre,
			apellido,
			dni,
			email,
			como_te_enteraste,
			charlas: charlasSeleccionadas, // Array de charlas seleccionadas
			fecha: new Date().toISOString()
		};
	},

	/**
	 * Actualiza el estado del boton de inscripción
	 * @param { boolean } deshabilitado - Estado de deshabilitación
	 * @param { string } texto - Texto a mostrar
	 */

	actualizarEstadoBoton(deshabilitado, texto) {
		const btnSumit = utilidades.obtenerElemento('#btn-formulario');
		if (btnSumit) {
			btnSumit.disabled = deshabilitado;
			btnSumit.textContent = texto;
			console.log(`Estado del botón actualizado: ${deshabilitado ? 'deshabilitado' : 'habilitado'}, texto: ${texto}`);
		}
	},

	/**
	 * Limpia el formulario tras un envio exitoso
	 */
	limpiarFormulario() {
		const form = utilidades.obtenerElemento('#inscripcionForm');
		if (form) {
			form.reset();
			
			// Limpiar también todos los checkboxes de charlas y sus clases visuales
			const checkboxesCharlas = utilidades.obtenerElementos('input[name="charlas"]');
			checkboxesCharlas.forEach(checkbox => {
				checkbox.checked = false;
				checkbox.parentElement.classList.remove('selected');
			});
			
			// Limpiar badges de charlas seleccionadas
			if (window.controladorCharlas && typeof window.controladorCharlas.actualizarBadgesCharlas === 'function') {
				window.controladorCharlas.actualizarBadgesCharlas();
			}
			
			console.log('Formulario, checkboxes y badges reiniciados');
		}
	},

	/**
	 * Valida el formato de un email
	 * @param { string } email - Email a validar
	 * @returns { boolean } - Resultado de la validacion
	 */
	validarEmail(email) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email)
	},

	/**
	 * Valida que el DNI contenga solo números
	 * @param { string } dni - DNI a validar
	 * @returns { boolean } - Resultado de la validación
	 */
	validarDNI(dni) {
		return /^\d+$/.test(dni);
	},

	/**
	 * Cargar las opciones para el selector "cómo te enteraste"
	 */
	async cargarOpcionesComoTeEnteraste(){
		try {
			console.log('Cargando opciones para el selector "cómo te enteraste"');
			
			const select = utilidades.obtenerElemento('#como-te-enteraste');
			if (!select) {
				console.warn('No se encontró el selector "#como-te-enteraste"');
				return;
			}

			// Si ya tiene opciones, respetarlas
			const opcionesExistentes = select.querySelectorAll('option:not([value=""])');
			if (opcionesExistentes.length > 0) {
				console.log(`Usando ${opcionesExistentes.length} opciones existentes en el HTML para "cómo te enteraste"`);
				return;
			}

			// Verificar cache primero
			if (this._opcionesCache.data && this._opcionesCache.timestamp &&
				(Date.now() - this._opcionesCache.timestamp) < this._opcionesCache.ttl) {
				console.log('Usando opciones desde cache');
				this._llenarSelectConOpciones(select, this._opcionesCache.data);
				return;
			}

			// Intentar cargar desde el servidor primero
			try {
				console.log('Intentando cargar opciones desde el servidor');
				const response = await fetch('/api/inscripcion/como-te-enteraste');
				
				if (response.ok) {
					const opciones = await response.json();
					console.log(`Cargadas ${opciones.length} opciones desde el servidor`);
					
					// Guardar en cache
					this._opcionesCache.data = opciones;
					this._opcionesCache.timestamp = Date.now();
					
					// Optimización: usar DocumentFragment para minimizar reflows
					this._llenarSelectConOpciones(select, opciones);
					
					console.log('Opciones del servidor añadidas correctamente');
					return;
				} else {
					console.warn('Error al cargar opciones del servidor, usando opciones predeterminadas');
				}
			} catch (fetchError) {
				console.warn('Error de conexión al cargar opciones, usando opciones predeterminadas', fetchError);
			}

			// Fallback: opciones predeterminadas
			console.log('Añadiendo opciones predeterminadas para "cómo te enteraste"');
			const opcionesPredeterminadas = [
				{ id: 'RS01', descripcion: 'Redes Sociales' },
				{ id: 'AM02', descripcion: 'Amigo/Familiar' },
				{ id: 'EM03', descripcion: 'Email' },
				{ id: 'WEB4', descripcion: 'Sitio Web' },
				{ id: 'AL04', descripcion: 'Alumno/a de UOCRA' },
				{ id: 'OT05', descripcion: 'Otro' }
			];

			// Guardar opciones predeterminadas en cache
			this._opcionesCache.data = opcionesPredeterminadas;
			this._opcionesCache.timestamp = Date.now();

			// Optimización: usar DocumentFragment para minimizar reflows
			this._llenarSelectConOpciones(select, opcionesPredeterminadas);
			
			console.log('Opciones predeterminadas añadidas correctamente');
		} catch (error) {
			console.error('Error al configurar opciones de "cómo te enteraste"', {
				error: error.message,
				stack: error.stack
			});
			console.error('Error al configurar opciones de "cómo te enteraste": ', error);
		};
	},
	/**
	 * Cargar las charlas disponibles desde el servidor
	 */
	async cargarCharlas() {
		console.log('Cargando charlas disponibles');

		// Utilizar el controlador de charlas global si esta disponible
		if (window.controladorCharlas?.inicializar) {
			console.log('Usando controlador de charlas global para cargar las charlas');
			const charlas = await window.controladorCharlas.inicializar();
			console.log(`Cargadas ${charlas?.length || 0} charlas correctamente`);
			return charlas
		};

		console.warn('Controlador de charlas no disponible, usando fallback');
		return [];
	},

	/**
	 * Inicializa el controlados de inscripciones
	 */
	async inicializar() {
		try {
			console.log('Inicializando controlador de inscripciones');

			//Configurar opciones del formulario
			await this.cargarOpcionesComoTeEnteraste();
			if (typeof this.cargarCharlas === 'function') {
				await this.cargarCharlas();
			};
			console.log('Controlador de inscripciones inicializado correctamente');
		} catch (error) {
			console.error('Error al inicializar controlador de inscripciones', {
				error: error.message,
				stack: error.stack
			});
			console.error('Error al inicializar controlador: ', error)
		}
	},

	/**
	 * Optimización: método helper para llenar select con DocumentFragment
	 */
	_llenarSelectConOpciones(select, opciones) {
		const fragment = document.createDocumentFragment();
		
		opciones.forEach(opcion => {
			const option = document.createElement('option');
			option.value = opcion.id;
			option.textContent = opcion.descripcion;
			fragment.appendChild(option);
		});
		
		// Una sola operación DOM
		select.appendChild(fragment);
	},
}
// Exportar para uso como módulo
export const controladorInscripciones = InscripcionesController;

// Auto-inicialización cuando se carga el documento
document.addEventListener('DOMContentLoaded', () => {
	console.log('Evento DOMContentLoaded recibido en inscriptos.js')

	setTimeout(() => {
		console.log('Intentando inicializar controlador de inscripciones');

		// Integrar con controlador global de manera segura
		if (window.controladorInscripciones) {
			console.log('Controlador global de inscripciones encontrado, extendiendo funcionalidad');

			// Preservar métodos existentes
			Object.entries(InscripcionesController).forEach(([key, value]) => {
				if (typeof value === 'function') {
					// Solo sobreescribir métodos
					window.controladorInscripciones[key] = value.bind(InscripcionesController);
				};
			});
		} else {
			console.log('Creando nuevo controlador global de inscripciones');
			// Crear nuevo controlador global
			window.controladorInscripciones = InscripcionesController;
		}

		// Inicializar
		if (window.controladorInscripciones.inicializar) {
			window.controladorInscripciones.inicializar();
		}
	}, 100); // Pequeño retraso para asegurar de main.js ya se ejecutó
})