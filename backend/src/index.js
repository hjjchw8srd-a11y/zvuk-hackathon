import cors from "cors";
import express from "express";
import { pool } from "./db.js";

const app = express();
const port = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  if (!pool) {
    res.json({ ok: true, db: "not_configured" });
    return;
  }

  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "up" });
  } catch {
    res.status(503).json({ ok: false, db: "down" });
  }
});

app.listen(port, () => {
  console.log(`API: http://localhost:${port}`);
});
