-- Inserción de datos iniciales para las tablas

-- Datos para la tabla como_te_enteraste
INSERT INTO como_te_enteraste (id, descripcion) VALUES 
('RS01', 'Redes Sociales'),
('AM02', 'Amigo/Familiar'),
('EM03', 'Email'),
('WEB4', 'Sitio Web'),
('AL04', 'Alumno/a de UOCRA'),
('OT05', 'Otro');

-- Registro especial para representar "No deseo asistir a ninguna charla"
INSERT INTO charlas (id, horario, titulo, empresa, ubicacion, cupo) VALUES
('N/A', 'N/A', 'No asistir a charla', 'N/A', 'N/A', 999999);

-- Datos para la tabla charlas (basados en data.json)
INSERT INTO charlas (id, horario, titulo, empresa, ubicacion, cupo) VALUES
('A11', '13:30', 'Realidad Virtual', 'RV Uocra', 'Aula 1.2', 25),
('A12', '13:30', 'Aluar - Division Elaborados', 'Aluar', 'Aula 2.1', 70),
('A13', '13:30', '3D Insumos', '3D Insumos', 'P.B Aula 2', 20),
('A14', '13:45', 'Bomberos', 'Bomberos', 'Aula 1.1', 50),
('A15', '13:45', 'Inst. UOCRA Enfermeria', 'Inst. UOCRA Enfermeria', 'Aula 2.2', 70),
('A16', '14:00', 'Grupo DEMA', 'Grupo DEMA', 'Aula 2.3', 50),
('A17', '14:00', 'IFTS', 'IFTS', 'Aula 3.4', 40),
('A18', '14:30', 'Realidad Virtual', 'RV Uocra', 'Aula 1.2', 25),
('A19', '14:30', 'Zoloda', 'ZOLODA', 'Aula 2.1', 70),
('A20', '14:45', 'Loma Negra', 'LOMA NEGRA', 'Aula 1.1', 50),
('A21', '14:45', 'UOCRA Mujeres', 'UOCRA Mujeres', 'Aula 2.2', 50),
('A22', '15:00', 'Klaukol', 'KLAUKOL', 'Aula 2.3', 50),
('A23', '15:00', 'FV Griferia de Alta Tecnologia', 'FV', 'Aula 3.4', 40),
('A24', '15:30', 'Realidad Virtual', 'RV Uocra', 'Aula 1.2', 25),
('A25', '15:30', 'Genrod', 'GENROD', 'Aula 2.1', 70),
('A26', '16:00', 'Dun Dun', 'DUN DUN', 'Aula 1.1', 50),
('A27', '16:00', 'Later-Cer S.A. -Cerámica Quilmes S.A.', 'Later-Cer S.A. -Cerámica Quilmes S.A.', 'Aula 2.3', 50),
('A28', '16:00', 'Ferrum', 'Ferrum S. A.', 'Aula 3.4', 40),
('A29', '16:30', 'Realidad Virtual', 'RV Uocra', 'Aula 1.2', 25),
('A30', '16:30', 'Tao construcciones', 'TAO', 'Aula 2.1', 70),
('A31', '16:45', 'CEFAS - El Milagro', 'CEFAS - El Milagro', 'Aula 1.1', 50),
('A32', '17:00', 'Plavicon', 'PLAVICON', 'Aula 1.1', 50),
('A33', '17:30', 'Realidad Virtual', 'RV Uocra', 'Aula 1.2', 25),
('A34', '17:30', 'El galgo', 'EL GALGO', 'Aula 2.1', 70),
('A35', '17:45', 'Cambre', 'CAMBRE', 'Aula 2.2', 70),
('A36', '18:00', 'Alba', 'ALBA', 'Aula 1.1', 50),
('A37', '18:00', 'Contextube', 'CONTEXTUBE', 'Aula 2.3', 50),
('A38', '18:00', 'Mekano', 'MEKANO', 'Patio', 40),
('A39', '18:00', 'Fischer', 'FISCHER', 'Aula 3.4', 40),
('A40', '18:30', 'Realidad Virtual', 'RV Uocra', 'Aula 1.2', 25),
('A41', '18:30', 'Retak', 'RETAK', 'Aula 2.1', 70),
('A42', '18:45', 'Microcontrol', 'MICROCONTROL', 'Aula 2.2', 70),
('A43', '18:45', 'Inet / Schineider', 'INET / SCHNEIDER', 'Aula 5.5', 40),
('A44', '19:00', 'Ceramica San Lorenzo', 'CERAMICA SAN LORENZO', 'Aula 1.1', 50),
('A45', '19:00', 'Sinteplas Pinturas', 'SINTEPLAST', 'Aula 2.3', 50),
('A46', '19:00', 'Dinatecnica', 'DINATECNICA', 'Aula 3.4', 40),
('A47', '19:30', 'Realidad Virtual', 'RV Uocra', 'Aula 1.2', 25),
('A48', '19:30', 'Saint Gobain', 'SAINT GOBAIN', 'Aula 2.1', 70),
('A49', '20:00', 'Gralf', 'GRALF', 'Aula 1.1', 50),
('A50', '20:00', 'Inst. UOCRA SyH', 'Inst. UOCRA SyH', 'Aula 2.2', 70),
('A51', '20:00', 'Durlock', 'DURLOCK', 'Aula 2.3', 50),
('A52', '20:00', 'Escorial', 'ESCORIAL', 'Aula 3.4', 40),
('A53', '20:30', 'Sinteplast Construcciones', 'SINTEPLAST', 'Aula 2.1', 70);