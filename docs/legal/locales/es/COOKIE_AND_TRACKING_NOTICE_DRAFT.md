<!-- l5: {"id":"cookie_and_tracking_notice","locale":"es","source_sha256":"86417f8487c7024e029e5e44b5e15bfc78979540ff2afef9a834ebd1677d5f0b","version":"L5-working-1","review":"pending"} -->
# Aviso de Ayinou sobre cookies y seguimiento

**DRAFT — NOT APPROVED FOR PUBLICATION**

**TRANSLATION DRAFT — QUALIFIED HUMAN AND LEGAL REVIEW REQUIRED**

## 1. Alcance

El inventario siguiente refleja la aplicación y las bibliotecas Auth instaladas en el momento de la revisión. No constituye una captura del tráfico de un futuro despliegue en producción. [Approval required — identificar al operador, el despliegue real, los servicios comprendidos, las opciones de preferencias y el contacto.]

| Mecanismo | Nombre o patrón actual | Finalidad y límites de duración |
| --- | --- | --- |
| Sesión Supabase Auth SSR | `sb-<auth-host-label>-auth-token` y fragmentos gestionados por el SDK cuando corresponda | Mantiene la sesión iniciada y permite al servidor actualizar el estado necesario. La presencia de la cookie del SDK no equivale a la validez actual de la sesión en el servidor. Verificar los atributos desplegados y la duración real durante el inicio, la renovación y el cierre de sesión. |
| Verificador del flujo Auth | `-code-verifier` gestionado por el SDK y variantes de la clave de la cookie Auth específicas del flujo | Permite flujos de cuenta con clave de prueba cuando corresponda. Confirmar las cookies reales tras probar la confirmación y la recuperación. No registrar sus valores ni reutilizar los elementos de verificación. |
| Idioma | Cookie `ayinou-locale` y clave localStorage del navegador | Recuerda el criollo haitiano, francés, inglés o español. El código fuente fija la duración de la cookie de idioma en 31 536 000 segundos, ruta `/`, SameSite Lax y Secure para escrituras por HTTPS. Una cuenta con sesión iniciada también puede tener una preferencia en el servidor. |
| Tema visual | localStorage `ayinou-home-theme` | Conserva la preferencia de tema del dispositivo si hay almacenamiento disponible. El código no fija una caducidad local para esta clave. |
| Modo del feed | localStorage `ayinou-feed-mode` | Recuerda la vista preferida del feed en el dispositivo. Una pestaña puede conservar la selección en memoria si falla el almacenamiento local. |
| Seguridad operativa | Metadatos de solicitudes en el servidor, registros de cuotas y registros de proveedores según la configuración | Ayuda a diagnosticar problemas, comprobar sesiones y prevenir abusos. Es distinto del almacenamiento de preferencias del dispositivo. Los plazos de conservación y la configuración de proveedores aprobados siguen pendientes. |

## 2. Opciones y límites

Una persona puede cambiar sus preferencias en la interfaz o borrar los datos del sitio en el navegador. Esto puede restablecer preferencias o cerrar la sesión en un dispositivo. No borra los registros del servidor ni revoca todas las demás sesiones. Utilice los ajustes de seguridad de la cuenta que correspondan para gestionar sesiones. Bloquear el estado Auth necesario puede impedir el inicio de sesión o la recuperación. Borre los datos del sitio tras usar un dispositivo público o compartido cuando proceda.

El inventario del producto incluido en el repositorio no identificó ninguna integración de publicidad o analítica. La gestión de DNS por Cloudflare, por sí sola, no demuestra una configuración de seguimiento en producción. Verifique cabeceras, cookies Auth, contenido incrustado, ajustes de proveedores y solicitudes a terceros en la versión desplegada. [Approval required — aprobar la clasificación final, la duración y finalidad de cada tecnología, la comunicación a terceros y las reglas de consentimiento aplicables. Decidir tras la revisión jurídica si hace falta un aviso independiente.] [Política de privacidad](../../PRIVACY_POLICY_DRAFT.md)
