// Extra analysis with NLP

import OpenAI from "openai";

export type skillType = { name: string;};

export type analysis = {
  skills: skillType[]; // up to 20
  buzzwords: { hits: string[]; count: number };
  comp_period_detected: "hour" | "year" | null;
};



let client: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY missing. Add it to .env.local for development or environment variables for production.");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

const buzzwordList = 
[ "rockstar",
  "ninja",
  "dynamic",
  "fast-paced",
  "self-starter",
  "wear many hats",
]

export async function analysisWithLLM(
  {
    text,                          // cleaned HTML->text, 
    metadata, 
    model = "gpt-4o-mini",    
    temperature = 0.2
  }: {
    text: string;
    // metadata is defined here if needed (passed from scoring/nlp.ts)
    metadata: { time_type?: string|null; currency?: string|null }; 
    model?: string;
    temperature?: number;
  }
): Promise<analysis> {


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
      comp_period_detected: { type: "string", enum: ["hour","year"], nullable: true }
    },
    required: ["skills","buzzwords","comp_period_detected"]
  } as const;

  const system = [
    "You extract scoring-only signals from job postings.",
    "Use the provided HINTS to guide you, but verify against the text.",
    "Return ONLY valid JSON matching the schema.",
    "Guidelines:",
    "- skills: up to 20 canonical skills (e.g., 'SQL', 'Python', 'AWS', 'Stakeholder management').",
    "- check for job posting buzzwords that may be red flags: list and count actual occurrences in text (cross-check given hints).",
    "- comp_period_detected: 'hour' or 'year' if clearly implied; else null."
  ].join("\n");

    const userPrompt = [
        "Full job text to analyze:",
        text,
        "\n--- HINTS (Do not invent based on these): ---",
        `Time Type already determined: ${metadata.time_type ?? 'None'}`,
        `Currency already determined: ${metadata.currency ?? 'None'}`,
        ];

    if (buzzwordList.length > 0) {
        userPrompt.push(`\n--- CUSTOM BUZZWORDS ---\nCheck for the following red-flag terms in the JOB TEXT and count their exact occurrences for the 'buzzwords' field: ${buzzwordList.join(', ')}`);
    }

    const finalUserPrompt = userPrompt.join('\n'); // Rename variable for clarity

    try { 
        const resp = await getOpenAIClient().responses.create({
        model,
        temperature,
        input: [
        { role: "system", content: system }, { role: "user", content: finalUserPrompt },
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

    // Validate comp_period_detected - ensure it's one of the expected values or null
    if (typeof parsed.comp_period_detected === "string") {
      if (parsed.comp_period_detected === "hour" || parsed.comp_period_detected === "year") {
        // Keep the valid string value
      } else {
        parsed.comp_period_detected = null;
      }
    } else if (parsed.comp_period_detected !== null) {
      parsed.comp_period_detected = null;
    }

    return parsed as analysis; // Returns the clean type
    } catch(error)
    {
        console.error("Error during LLM analysis or JSON parsing:", error); 
        return {
            skills: [],
            buzzwords: { hits: [], count: 0 },
            comp_period_detected: null,
        }; 
    }
}