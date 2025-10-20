// lib/analyzeJob.ts
export type Tier = "Low" | "Medium" | "High";

export interface RiskResult {
  score: number;
  tier: Tier;
  redFlags: string[];
  recommendations: string[];
}

// Keep buzzwords local for now (we can move later if you want)
const BUZZWORDS = [
  "rockstar",
  "ninja",
  "dynamic",
  "fast-paced",
  "self-starter",
  "wear many hats",
];

export const analyzeJob = (text: string): RiskResult => {
  let score = 20;
  const redFlags: string[] = [];
  const recommendations: string[] = [];

  const lowerText = text.toLowerCase();

  // Check for salary/compensation
  if (
    !lowerText.includes("salary") &&
    !lowerText.includes("compensation") &&
    !lowerText.includes("$") &&
    !lowerText.includes("pay")
  ) {
    score += 20;
    redFlags.push("No salary range");
    recommendations.push("Ask for salary range before applying");
  }

  // Check for human contact
  if (
    !lowerText.includes("recruiter") &&
    !lowerText.includes("hiring manager") &&
    !lowerText.includes("careers@") &&
    !lowerText.includes("apply@")
  ) {
    score += 10;
    redFlags.push("No human contact");
    recommendations.push("Verify contact person exists");
  }

  // Check for process/timeline
  if (
    !lowerText.includes("timeline") &&
    !lowerText.includes("interview") &&
    !lowerText.includes("next steps") &&
    !lowerText.includes("process")
  ) {
    score += 8;
    redFlags.push("Missing timeline");
    recommendations.push("Ask about interview process");
  }

  // Check for evergreen language
  if (
    lowerText.includes("evergreen") ||
    lowerText.includes("repost") ||
    lowerText.includes("talent pool") ||
    lowerText.includes("continuously hiring")
  ) {
    score += 12;
    redFlags.push("Evergreen post");
    recommendations.push("Verify if position is currently open");
  }

  // Check for buzzwords
  let buzzwordCount = 0;
  BUZZWORDS.forEach((word) => {
    if (lowerText.includes(word)) buzzwordCount++;
  });

  if (buzzwordCount > 0) {
    const buzzwordScore = Math.min(buzzwordCount * 6, 30);
    score += buzzwordScore;
    redFlags.push("Vague buzzwords");
    recommendations.push("Look for specific role requirements");
  }

  // Simulated post age check
  if (
    lowerText.includes("30+") ||
    lowerText.includes("60+") ||
    lowerText.includes("90+")
  ) {
    score += 10;
    redFlags.push("Old posting");
    recommendations.push("Check posting date on company site");
  }

  score = Math.max(0, Math.min(100, score));

  let tier: Tier;
  if (score < 40) tier = "Low";
  else if (score < 70) tier = "Medium";
  else tier = "High";

  if (tier !== "Low") {
    recommendations.push("Cross-reference with company careers page");
    recommendations.push("Research company on LinkedIn");
  }

  return { score, tier, redFlags, recommendations };
};
