const express = require("express");
const { Client } = require("@notionhq/client");

const app = express();
app.use(express.json());

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const API_KEY = process.env.API_KEY;

if (!NOTION_TOKEN || !NOTION_DATABASE_ID || !API_KEY) {
  console.error("Faltan variables de entorno: NOTION_TOKEN, NOTION_DATABASE_ID, API_KEY");
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

// ✅ Health público
app.get("/health", (req, res) => res.send("ok"));

// 🔒 Seguridad para lo demás
app.use((req, res, next) => {
  const key = req.header("x-api-key");
  if (key !== API_KEY) return res.status(401).json({ ok: false, error: "Unauthorized" });
  next();
});

// Normaliza: minúsculas, sin tildes, sin espacios extra
const normalize = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// ✅ ESTADOS reales según tu Notion actual (captura):
// "pendiente"  /  "En progreso"  /  "Listo"
const estadoToNotionName = (estado) => {
  const e = normalize(estado);

  // Pendiente / Sin empezar / etc => "pendiente"
  if (["pendiente", "sin empezar", "no iniciado", "por hacer", "to-do", "todo"].includes(e)) {
    return "pendiente";
  }

  // En progreso
  if (["en progreso", "progreso", "en curso", "in progress"].includes(e)) {
    return "En progreso";
  }

  // Listo
  if (["listo", "completado", "completada", "terminado", "terminada", "done"].includes(e)) {
    return "Listo";
  }

  // default seguro
  return "pendiente";
};

const tipoMap = {
  reunion: "Reunión",
  cita: "Cita",
  tarea: "Tarea",
  recordatorio: "Recordatorio",
};

app.post("/agenda", async (req, res) => {
  try {
    const {
      Nombre,
      Fecha,
      Tipo,
      Personas = "",
      Descripción = "",
      Estado = "pendiente",
    } = req.body || {};

    if (!Nombre) return res.status(400).json({ ok: false, error: "Falta Nombre" });
    if (!Fecha) return res.status(400).json({ ok: false, error: "Falta Fecha" });
    if (!Tipo) return res.status(400).json({ ok: false, error: "Falta Tipo" });

    // Normaliza Tipo (multi_select)
    const tiposRaw = Array.isArray(Tipo) ? Tipo : [Tipo];
    const tiposNorm = tiposRaw
      .map((t) => tipoMap[normalize(t)] || String(t).trim())
      .filter(Boolean);

    // Normaliza Estado al nombre exacto que existe en Notion
    const estadoNotion = estadoToNotionName(Estado);

    const created = await notion.pages.create({
      parent: { database_id: NOTION_DATABASE_ID },
      properties: {
        "Nombre": { title: [{ text: { content: String(Nombre) } }] },
        "Fecha": { date: { start: String(Fecha) } },
        "Tipo": { multi_select: tiposNorm.map((t) => ({ name: t })) },
        "Personas": { rich_text: [{ text: { content: String(Personas) } }] },
        "Descripción": { rich_text: [{ text: { content: String(Descripción) } }] },
        "Estado": { status: { name: estadoNotion } },
      },
    });

    res.json({
      ok: true,
      notion_page_id: created.id,
      normalized: { Tipo: tiposNorm, Estado: estadoNotion },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Listening on", port));
