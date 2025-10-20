//lib/nlp/index.ts
import OpenAI from "openai";

// Extra analysis with NLP


export type skillType = { name: string;};

export type analysis = {
  skills: skillType[]; // up to 20
  buzzwords: { hits: string[]; count: number };
  comp_period_detected: "hour" | "year" | null;
};


// Helpers 

export function hintBuzzwords(text: string, list: string[] = []) {
  const base = ["rockstar","ninja","guru","synergy","hustle","wear many hats","disrupt","game-changing","wizard"];
  const bag = Array.from(new Set([...base, ...list].map(s => s.toLowerCase())));
  const t = text.toLowerCase();
  const hits = bag.filter(w => t.includes(w));
  return { buzzwords: hits.slice(0, 30) };
}

export function hintCompPeriod(text: string): "hour" | "year" | null {
  const s = text.toLowerCase();
  if (/\b(hourly|\/\s*hr|\$?\d+\s*\/\s*h|\bper\s*hour\b|\bhrly\b)\b/.test(s)) return "hour";
  if (/\b(annual|salary|per\s*yr|per\s*year|\/\s*yr|\/\s*year)\b/.test(s)) return "year";
  return null;
}



const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function analysisWithLLM(
  {
    text,                          // cleaned HTML->text, 
    metadata,                      // minimal DB-ish fields to compare
    buzzwordList = [],             // custom buzzwords
    model = "gpt-4o-mini",    
    temperature = 0.2
  }: {
    text: string;
    metadata: { time_type?: string|null; currency?: string|null };
    buzzwordList?: string[];
    model?: string;
    temperature?: number;
  }
): Promise<analysis> {

  // ---- build lightweight hints  ----
  const { buzzwords } = hintBuzzwords(text, buzzwordList);
  const compPeriodHint = hintCompPeriod(text);

  // ---- JSON schema ONLY for insights ----
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      skills: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
          },
          required: ["name"]
        }
      },
      buzzwords: {
        type: "object",
        additionalProperties: false,
        properties: {
          hits: { type: "array", items: { type: "string" } },
          count: { type: "integer" }
        },
        required: ["hits","count"]
      },
      comp_period_detected: { type: ["string","null"], enum: ["hour","year"] }
    },
    required: ["skills","buzzwords","comp_period_detected"]
  } as const;

  const system = [
    "You extract scoring-only signals from job postings.",
    "Use the provided HINTS to guide you, but verify against the text.",
    "Return ONLY valid JSON matching the schema.",
    "Guidelines:",
    "- skills: up to 20 canonical skills (e.g., 'SQL', 'Python', 'AWS', 'Stakeholder management').",
    "- buzzwords: list and count actual occurrences in text (cross-check given hints).",
    "- comp_period_detected: 'hour' or 'year' if clearly implied; else null."
  ].join("\n");

  const resp = await client.responses.create({
    model,
    temperature,
    input: [
      { role: "system", content: system },
    ],
    text : {
        format : {
            type: 'json_schema',
            name: 'analysis',
            schema,
            strict: true,

        },
    },
  });
    // Safety checks on LLM results
    const parsed = JSON.parse(resp.output_text ?? "{}");

    if (!Array.isArray(parsed.skills)) parsed.skills = [];

    parsed.skills = parsed.skills
    .filter((s: any) => typeof s?.name === "string")
    .map((s: any) => ({ name: String(s.name).slice(0, 64) })) // Maps to { name: string }
    .slice(0, 20);

    if (!["hour", "year", null].includes(parsed.comp_period_detected)) parsed.comp_period_detected = null;

    return parsed as analysis; // Returns the clean type
}