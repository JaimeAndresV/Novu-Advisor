# Estrategia de captación de datos no invasiva

Objetivo: captar datos del visitante (email, teléfono, nombre) **sin bloquear la conversación**, sin formularios obligatorios y solo cuando aporta valor.

---

## Principios

1. **Nunca bloquear**  
   El visitante puede chatear desde el primer mensaje. No hay pantalla previa tipo “Introduce tu email para continuar”.

2. **Valor primero**  
   Solo se sugiere dejar datos cuando hay un beneficio claro: “Te envío el PDF por email”, “Que te llamemos para agendar la demo”, etc.

3. **Opcional y transparente**  
   El asesor usa siempre lenguaje opcional: “si quieres”, “cuando te venga bien”, “opcional”. No se exige email/teléfono para seguir la conversación.

4. **Una sugerencia suave por conversación**  
   Se hace como mucho una invitación natural a dejar contacto en cada conversación; no se repite en cada mensaje.

5. **Captación en el propio chat**  
   Si el visitante escribe su email o teléfono en el chat, el sistema lo detecta y lo guarda como lead. No hace falta un formulario aparte.

---

## Cómo funciona hoy

| Momento | Comportamiento |
|--------|-----------------|
| **Primer mensaje** | El asesor nunca pide email ni teléfono. Responde y ayuda. |
| **Durante la conversación** | Puede ofrecer valor a cambio de contacto: “¿Quieres que te envíe X por email? Escríbelo aquí.” |
| **Cuando el usuario escribe datos** | Se extraen automáticamente email, teléfono o nombre del mensaje y se guardan como lead (tabla `leads`, sesión marcada como lead). |
| **Botones de contacto** | Se muestran al final cuando tiene sentido (pricing, próximos pasos). Son enlaces (llamar, email, WhatsApp, etc.), no captura obligatoria. |

---

## Reglas en el prompt del asesor

- No pedir email/teléfono en el **primer** mensaje.
- Sugerir dejar contacto **solo** cuando hay valor (enviar PDF, agendar llamada, enviar demo, etc.).
- Usar siempre “opcional”, “si quieres”, “cuando te venga bien”.
- No repetir la petición de datos; una invitación por conversación es suficiente.
- Si el visitante ya ha escrito su email o teléfono, no volver a pedirlo.

---

## Qué no hacemos (invasivo)

- Formulario obligatorio antes de chatear.
- Pop-ups pidiendo email.
- Pedir datos en el primer mensaje del asesor.
- Presionar en cada respuesta para que dejen email o teléfono.
- Ocultar que los datos se usan para seguimiento (el asesor puede decir que “si dejas tu email, te enviamos X” o “te contactamos”).

---

## Dónde se configura

- **Comportamiento del asesor**: reglas en el system prompt (servicio `AIService`, regla “LEAD CAPTURE (non-invasive)”).
- **Detección y guardado**: `LeadService` (extrae email/teléfono/nombre del texto del mensaje) y `routes/chat.js` (guarda lead y marca sesión).
- **Notificaciones**: `NotifyService.sendLeadNotification` envía un correo al negocio cuando se captura un lead (si tiene `contact_email`).

Opcional: en el dashboard se puede añadir un ajuste por negocio (ej. “suggest_contact_after_messages: 3”) para que la primera sugerencia suave solo aparezca después de N intercambios; por defecto el prompt ya limita a una sugerencia por conversación.
