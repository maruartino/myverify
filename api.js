const fs = require("fs");
const express = require("express");
const sharp = require("sharp");

/* ================= CONFIG ================= */

const PORT = process.env.PORT || 8080;
const CACHE_FILE = "./cache.txt";
const MAX_DISTANCE = 12;

/* ================= HASH ================= */

function aHash(pixels) {
  let sum = 0;
  for (const p of pixels) sum += p;
  const avg = sum / pixels.length;

  let hash = "";
  for (const p of pixels) hash += p > avg ? "1" : "0";
  return hash;
}

function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) d++;
  }
  return d;
}

/* ================= LOAD CACHE ================= */

const CACHE = Object.create(null);

if (fs.existsSync(CACHE_FILE)) {
  for (const line of fs.readFileSync(CACHE_FILE, "utf8").split("\n")) {
    const [name, hash] = line.split("|");
    if (name && hash) CACHE[name] = hash;
  }
  console.log("📦 Cache carregado:", Object.keys(CACHE).length);
} else {
  console.warn("⚠️ cache.txt não encontrado");
}

/* ================= IDENTIFY ================= */

async function hashFromBuffer(buffer) {
  const raw = await sharp(buffer)
    .resize(128, 128, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();

  return aHash(raw);
}

async function identifyFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao baixar imagem");

  const buffer = Buffer.from(await res.arrayBuffer());
  const hash = await hashFromBuffer(buffer);

  let best = null;
  let bestDist = Infinity;

  for (const [name, h] of Object.entries(CACHE)) {
    const d = hamming(hash, h);
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }

  if (bestDist > MAX_DISTANCE) {
    return { pokemon: null, confidence: "low" };
  }

  return {
    pokemon: best,
    confidence: "high",
    distance: bestDist
  };
}

/* ================= API ================= */

const app = express();
app.use(express.json({ limit: "2mb" }));

app.post("/identify", async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl ausente" });
    }

    const result = await identifyFromUrl(imageUrl);
    res.json(result);

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao processar imagem" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Servidor rodando na porta", PORT);
});
