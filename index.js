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

// ✅ Health check público (sin API key)
app.get("/health", (req, res) => res.send("ok"));

// 🔒 Seguridad para TODO lo demás
app.use((req, res, next) => {
  const key = req.header("x-api-key");
  if (key !== API_KEY) return res.status(401).json({ ok: false, error: "Unauthorized" });
  next();
});

/**
 * POST /agenda
 * Body:
 * {
 *   "Nombre": "Reunión con Juan",
 *   "Fecha": "2026-01-12T16:00:00-05:00",
 *   "Tipo": "Reunión" OR ["Reunión"],
 *   "Personas": "Juan",
 *   "Descripción": "Sobre presupuesto",
 *   "Estado": "Sin empezar"
 * }
 */
app.post("/agenda", async (req, res) => {
  try {
    const {
      Nombre,
      Fecha,
      Tipo,
      Personas = "",
      Descripción = "",
      Estado = "Sin empezar",
    } = req.body || {};

    if (!Nombre) return res.status(400).json({ ok: false, error: "Falta Nombre" });
    if (!Fecha) return res.status(400).json({ ok: false, error: "Falta Fecha" });
    if (!Tipo) return res.status(400).json({ ok: false, error: "Falta Tipo" });

    const tipos = Array.isArray(Tipo) ? Tipo : [Tipo];

    const created = await notion.pages.create({
      parent: { database_id: NOTION_DATABASE_ID },
      properties: {
        "Nombre": { title: [{ text: { content: String(Nombre) } }] },
        "Fecha": { date: { start: String(Fecha) } },
        "Tipo": { multi_select: tipos.map((t) => ({ name: String(t) })) },
        "Personas": { rich_text: [{ text: { content: String(Personas) } }] },
        "Descripción": { rich_text: [{ text: { content: String(Descripción) } }] },
        "Estado": { status: { name: String(Estado) } },
      },
    });

    res.json({ ok: true, notion_page_id: created.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Listening on", port));
