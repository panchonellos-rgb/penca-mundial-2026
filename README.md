# ⚽ Penca Mundial 2026

Sistema completo de penca rioplatense para el Mundial FIFA 2026. Predicciones pre-torneo, ranking en tiempo real, panel de administración.

---

## 🏗️ Arquitectura

- **Frontend**: Next.js 14 (Pages Router)
- **Base de datos**: Supabase (PostgreSQL gratuito)
- **Deploy**: Vercel (gratuito)
- **Sin servidor propio** — todo serverless

---

## 🚀 Guía de despliegue paso a paso

### PASO 1 — Crear cuenta en Supabase

1. Ir a [supabase.com](https://supabase.com) y crear cuenta gratuita
2. Crear un nuevo proyecto (elegir región más cercana, ej: `South America (São Paulo)`)
3. Guardar la contraseña del proyecto

### PASO 2 — Crear la base de datos

1. En tu proyecto Supabase, ir a **SQL Editor**
2. Copiar todo el contenido de `supabase_schema.sql`
3. Pegar y ejecutar con el botón **Run**
4. Verificar que no hubo errores

### PASO 3 — Obtener las credenciales de Supabase

1. En Supabase, ir a **Settings → API**
2. Copiar:
   - **Project URL** → será tu `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → será tu `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### PASO 4 — Subir el código a GitHub

1. Crear un repositorio nuevo en [github.com](https://github.com)
2. Subir todos los archivos de este proyecto al repositorio

### PASO 5 — Deploy en Vercel

1. Ir a [vercel.com](https://vercel.com) y crear cuenta (gratis con GitHub)
2. Click en **New Project** → importar tu repositorio de GitHub
3. En **Environment Variables**, agregar:
   ```
   NEXT_PUBLIC_SUPABASE_URL = https://tuproyecto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = tu-clave-aqui
   ```
4. Click en **Deploy**
5. En 2 minutos tendrás tu URL: `https://tu-penca.vercel.app`

---

## 🎯 Cómo usar la penca

### Como administrador

1. Ir a la URL raíz: `https://tu-penca.vercel.app`
2. Ingresar el nombre del torneo (ej: "Oficina Contabilidad")
3. Se generan automáticamente:
   - **Link de invitación** → para compartir con participantes
   - **Link de administrador** → tu acceso privado (¡guardarlo!)
4. El panel admin tiene 4 secciones:
   - **Dashboard**: estadísticas generales, links
   - **Ranking**: tabla de posiciones en vivo
   - **Cargar Resultados**: ingresar scores oficiales (calcula puntos automáticamente)
   - **Jugadores**: lista de participantes con sus links

### Como participante

1. Recibís el link de invitación
2. Completás: nombre, apellido, email
3. Accedés a tu penca y predecís los 71 partidos de fase de grupos + 16avos (y los que se habiliten)
4. Guardás tu link personal para volver y modificar predicciones antes del inicio
5. **Las predicciones se guardan automáticamente** al salir del campo de puntaje

---

## 📊 Sistema de puntuación

| Acierto | Puntos base |
|---------|-------------|
| Resultado exacto (ambos goles) | 5 pts |
| Ganador correcto / Empate correcto | 2 pts |
| Goles exactos de local (solo) | +1 pt |
| Goles exactos de visitante (solo) | +1 pt |

### Multiplicadores por fase

| Fase | Multiplicador |
|------|--------------|
| Fase de Grupos | ×1 |
| 16avos de Final | ×2 |
| Cuartos de Final | ×4 |
| Semifinales | ×8 |
| Final | ×16 |

**Ejemplo:** Resultado exacto en la Final = 5 × 16 = **80 puntos**

---

## ⚙️ Reglas de negocio importantes

1. **Predicciones previas al torneo**: El administrador puede cerrar el registro en cualquier momento con el botón "Cerrar registro". Se recomienda hacerlo antes del primer partido (11 JUN 2026 a las 16:00 UY).

2. **Predicciones se guardan automáticamente** al hacer blur en el campo de score.

3. **Resultado exacto vs. desglosado**: Si acertás el resultado exacto, llevás 5 pts base SIN sumar los puntos individuales de goles. Si no acertás el resultado exacto, se suman los puntos parciales.

4. **Los puntos se calculan** cuando el administrador carga el resultado oficial en el panel.

5. **Múltiples pencas**: Podés crear múltiples torneos desde la home, cada uno con su propio link.

---

## 📅 Fixture incluido

- **71 partidos de Fase de Grupos** (11 JUN al 28 JUN 2026)
- **4 partidos de 16avos** (28-30 JUN 2026, equipos a definir)
- Todos los horarios en **hora de Uruguay (UTC-3)**

---

## 🛠️ Desarrollo local

```bash
# Clonar e instalar
npm install

# Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales de Supabase

# Iniciar servidor de desarrollo
npm run dev
# → http://localhost:3000
```

---

## 📁 Estructura del proyecto

```
penca-mundial-2026/
├── src/
│   ├── pages/
│   │   ├── index.js              # Home: crear torneo
│   │   ├── invite/[token].js     # Registro de participantes
│   │   ├── predict/[token].js    # Interfaz de predicciones
│   │   └── admin/[token].js      # Panel administrador
│   ├── lib/
│   │   ├── supabase.js           # Cliente de Supabase
│   │   └── fixture.js            # Datos del fixture Mundial 2026
│   └── styles/
│       └── globals.css           # Estilos globales
├── supabase_schema.sql           # Schema completo de la BD
├── .env.example                  # Template de variables de entorno
└── vercel.json                   # Config de deploy
```

---

## 🔒 Seguridad

- Los tokens de admin y de jugador son cadenas aleatorias de 20 caracteres
- No hay autenticación formal — la seguridad está basada en tokens en URLs (suficiente para uso informal entre conocidos)
- Supabase RLS está habilitado con políticas públicas (apropiado para este caso de uso)

---

*Hecho con ❤️ para la penca más seria del barrio* ⚽🏆
