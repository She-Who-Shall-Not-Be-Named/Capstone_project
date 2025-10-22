"use client";
import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { analyzeJob, type Tier, type RiskResult } from "../lib/analyzeJob";
import { logout } from "@/utils/supabase/action";

const SAMPLE_JOB = `We're looking for a rockstar developer to join our dynamic team! This is a fast-paced environment where you'll wear many hats and be a self-starter.

Join our talent pool for exciting opportunities! We're continuously hiring ninja developers who can work in our evergreen positions.

Requirements:
- 5+ years experience
- Full stack development
- Work independently
- Flexible schedule

This position has been reposted for 90+ days to build our candidate pipeline.

Apply now to be considered for future openings!`;

const GREENHOUSE_SAMPLE_JOB = `Software Engineer - Full Stack

We are looking for a passionate Software Engineer to join our growing engineering team. You will work on building scalable web applications and contribute to our core platform.

Responsibilities:
- Develop and maintain web applications using React and Node.js
- Collaborate with product and design teams
- Write clean, maintainable code with test coverage
- Participate in code reviews and technical discussions

Requirements:
- 3+ years of software development experience
- Proficiency in JavaScript, React, and Node.js
- Experience with databases (PostgreSQL, MongoDB)
- Strong problem-solving skills
- Bachelor's degree in Computer Science or related field

Benefits:
- Competitive salary ($90,000 - $120,000)
- Health insurance and dental coverage
- 401k matching
- Flexible PTO policy
- Remote work options

To apply, please submit your resume and cover letter. We review applications on a rolling basis and typically respond within 1 week.

Equal Opportunity Employer`;

export default function GhostJobChecker() {
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState<RiskResult | null>(null);
  const [displayScore, setDisplayScore] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  async function handleLogout() {
    await logout();
  }

  const isGreenhouseUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes("greenhouse.io");
    } catch {
      return false;
    }
  };

  const isFormValid =
    Boolean(jobUrl.trim()) &&
    isValidUrl(jobUrl) &&
    Boolean(jobDescription.trim());

  // Score animation
  useEffect(() => {
    if (!result) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReducedMotion) {
      setDisplayScore(result.score);
      return;
    }

    let startTime = 0;
    const duration = 900;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);

      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setDisplayScore(Math.round(result.score * easeOutQuart));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [result]);

  const handleFetchUrl = async () => {
    if (!jobUrl.trim()) {
      toast.error("Please enter a job URL");
      return;
    }

    if (!isValidUrl(jobUrl)) {
      toast.error("Please enter a valid URL");
      return;
    }

    if (!isGreenhouseUrl(jobUrl)) {
      toast.info(
        "Auto-fetch works only for greenhouse.io right now. Please paste the job description instead."
      );
      return;
    }

    setIsFetching(true);
    setFetchError("");

    try {
      const response = await fetch(jobUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      setJobDescription(text);
      toast.success("Fetched job description from URL");
    } catch (_error) {
      setFetchError(
        "Couldn't fetch due to site restrictions—please paste the job description instead."
      );
      toast.error(
        "Fetch blocked by CORS/site rules. Paste the job description."
      );
    } finally {
      setIsFetching(false);
    }
  };

  const handleAnalyze = async () => {
    if (!jobUrl.trim()) {
      toast.error("Job URL is required");
      return;
    }
    if (!isValidUrl(jobUrl)) {
      toast.error("Please enter a valid URL");
      return;
    }

    // Show accuracy warning if non-Greenhouse URL
    if (!isGreenhouseUrl(jobUrl)) {
      toast.warning(
        "Heads up: this URL isn't from greenhouse.io. We couldn't fetch/verify it, so results may be less accurate."
      );
    }

    if (!jobDescription.trim()) {
      toast.error("Job description is required");
      return;
    }

    setIsAnalyzing(true);
    setFetchError("");

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 800));

    const analysisResult = analyzeJob(jobDescription);
    setResult(analysisResult);
    setIsAnalyzing(false);

    toast[analysisResult.tier === "High" ? "warning" : "success"](
      `Analysis complete — ${analysisResult.tier} risk`
    );
  };

  const handleTrySample = async () => {
    setJobUrl("https://example.com/job/123");
    setJobDescription(SAMPLE_JOB);
    setIsAnalyzing(true);

    await new Promise((resolve) => setTimeout(resolve, 600));

    const analysisResult = analyzeJob(SAMPLE_JOB);
    setResult(analysisResult);
    setIsAnalyzing(false);
  };

  const handleTryGreenhouseSample = async () => {
    setJobUrl("https://company.greenhouse.io/jobs/123456");
    setJobDescription(GREENHOUSE_SAMPLE_JOB);
    setIsAnalyzing(true);

    await new Promise((resolve) => setTimeout(resolve, 600));

    const analysisResult = analyzeJob(GREENHOUSE_SAMPLE_JOB);
    setResult(analysisResult);
    setIsAnalyzing(false);
  };

  const getTierColor = (tier: Tier) => {
    switch (tier) {
      case "Low":
        return "text-green-700 bg-green-100 border-green-200";
      case "Medium":
        return "text-amber-700 bg-amber-100 border-amber-200";
      case "High":
        return "text-red-700 bg-red-100 border-red-200";
    }
  };

  const getGaugeColor = (score: number) => {
    if (score < 40) return "#16a34a";
    if (score < 70) return "#d97706";
    return "#dc2626";
  };

  return (
    <>
      <style>{`
        .score-gauge {
          background: conic-gradient(
            from 0deg,
            var(--gauge-color) 0deg,
            var(--gauge-color) calc(var(--score) * 3.6deg),
            #f3f4f6 calc(var(--score) * 3.6deg),
            #f3f4f6 360deg
          );
        }

        .results-enter {
          opacity: 0;
          transform: translateY(12px);
          transition: opacity 0.4s ease-out, transform 0.4s ease-out;
        }

        .results-enter-active {
          opacity: 1;
          transform: translateY(0);
        }

        @media (prefers-reduced-motion: reduce) {
          .score-gauge, .transition-all, .results-enter {
            transition: none !important;
            animation: none !important;
          }
          .results-enter {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-orange-100 shadow-sm">
          <div className="max-w-screen-lg mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <h1 className="text-2xl font-extrabold tracking-tight">
                <span className="text-orange-600">Job</span>{" "}
                <span className="text-slate-900">Busters</span>
              </h1>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600 hidden sm:inline">
                  Detect suspicious job postings
                </span>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-screen-lg mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Hero */}
          <div className="text-center mb-12">
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              Don't Fall for{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-orange-500">
                Ghost Jobs
              </span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Analyze job postings to identify red flags that indicate fake or
              misleading positions. Protect your time and find real
              opportunities.
            </p>
          </div>

          {/* Input Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-orange-100 p-6 mb-8">
            <div className="space-y-6">
              {/* URL Input */}
              <div>
                <label
                  htmlFor="job-url"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Job URL *
                </label>
                <div className="flex gap-3">
                  <input
                    id="job-url"
                    type="url"
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                    placeholder="https://company.greenhouse.io/jobs/123456"
                    className="flex-1 px-4 py-2 border border-gray-300 text-black rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    data-testid="url-input"
                  />
                  <button
                    onClick={handleFetchUrl}
                    disabled={isFetching || !jobUrl.trim()}
                    className="px-6 py-2 bg-orange-100 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {isFetching && (
                      <div className="w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
                    )}
                    Fetch From URL (beta)
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Required: Valid job posting URL (Greenhouse URLs supported for
                  fetching)
                </p>
              </div>

              {/* Job Description */}
              <div>
                <label
                  htmlFor="job-description"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Job Description *
                </label>
                <textarea
                  id="job-description"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the complete job posting here..."
                  rows={8}
                  className="w-full px-4 py-3 border border-gray-300 text-black rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-vertical"
                  data-testid="jd-textarea"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Required: Include all details - requirements, benefits,
                  application process, etc.
                </p>
              </div>

              {/* Error Message */}
              {fetchError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {fetchError}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !isFormValid}
                  className="flex-1 sm:flex-none px-8 py-3 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  data-testid="analyze-btn"
                >
                  {isAnalyzing && (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  Analyze Job Posting
                </button>

                <button
                  onClick={handleTrySample}
                  disabled={isAnalyzing}
                  className="px-6 py-3 bg-white border border-orange-300 text-orange-700 font-medium rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-50"
                >
                  Try Sample Job
                </button>

                <button
                  onClick={handleTryGreenhouseSample}
                  disabled={isAnalyzing}
                  className="px-6 py-3 bg-white border border-green-300 text-green-700 font-medium rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
                >
                  Try Greenhouse Sample
                </button>
              </div>
            </div>
          </div>

          {/* Results */}
          {result && (
            <div
              className={`bg-white rounded-2xl shadow-sm border border-orange-100 p-6 results-enter ${
                result ? "results-enter-active" : ""
              }`}
            >
              <h3 className="text-xl font-semibold text-gray-900 mb-6">
                Analysis Results
              </h3>

              <div className="grid lg:grid-cols-2 gap-8">
                {/* Score Gauge */}
                <div className="flex flex-col items-center">
                  <div
                    className="score-gauge w-48 h-48 rounded-full flex items-center justify-center relative transition-all duration-1000"
                    style={
                      {
                        "--score": displayScore,
                        "--gauge-color": getGaugeColor(result.score),
                      } as React.CSSProperties
                    }
                    data-testid="score-gauge"
                  >
                    <div className="w-32 h-32 bg-white rounded-full flex flex-col items-center justify-center shadow-lg">
                      <div className="text-3xl font-bold text-gray-900">
                        {displayScore}
                      </div>
                      <div className="text-sm text-gray-600">Risk Score</div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <span
                      className={`inline-flex px-4 py-2 rounded-full text-sm font-medium border ${getTierColor(
                        result.tier
                      )}`}
                      data-testid="tier-pill"
                    >
                      {result.tier} Risk
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-6">
                  {/* Red Flags */}
                  <div data-testid="red-flags">
                    <h4 className="font-semibold text-gray-900 mb-3">
                      🚩 Red Flags
                    </h4>
                    {result.redFlags.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {result.redFlags.map((flag, index) => (
                          <span
                            key={index}
                            className="inline-flex px-3 py-1 bg-red-100 text-red-800 text-sm rounded-full border border-red-200"
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-600 text-sm">
                        No major red flags detected
                      </p>
                    )}
                  </div>

                  {/* Recommendations */}
                  <div data-testid="recommendations">
                    <h4 className="font-semibold text-gray-900 mb-3">
                      💡 Recommendations
                    </h4>
                    <ul className="space-y-2">
                      {result.recommendations.map((rec, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-2 text-sm text-gray-700"
                        >
                          <span className="text-orange-600 mt-0.5">•</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
