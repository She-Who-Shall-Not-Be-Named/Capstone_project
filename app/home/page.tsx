"use client";
import GlobalStyles from "@/app/components/GlobalStyles";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Menu,
  X,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { samplePosts, buzzwords } from "@/lib/scoring/constants";
import { analyzeJob } from "@/lib/scoring/analyzeJob";

interface RiskResult {
  score: number;
  tier: "Low" | "Medium" | "High";
  redFlags: string[];
  recommendations: string[];
}

const Index = () => {
  const [jobText, setJobText] = useState("");
  const [result, setResult] = useState<RiskResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [visibleElements, setVisibleElements] = useState<Set<string>>(
    new Set()
  );
  const router = useRouter();
  const [currentScore, setCurrentScore] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const handleAnalyze = async () => {
    if (!jobText.trim()) return;

    setIsAnalyzing(true);
    setCurrentScore(0);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const analysisResult = analyzeJob(jobText);
    setResult(analysisResult);
    setIsAnalyzing(false);

    // Animate score counter
    let start = 0;
    const end = analysisResult.score;
    const duration = 1000;
    const increment = end / (duration / 16);

    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCurrentScore(end);
        clearInterval(timer);
      } else {
        setCurrentScore(Math.floor(start));
      }
    }, 16);

    document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSampleClick = (sample: "A" | "B") => {
    setJobText(samplePosts[sample]);
    setResult(null);
    setCurrentScore(0);
  };

  // Intersection Observer for animations
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleElements((prev) => new Set([...prev, entry.target.id]));
          }
        });
      },
      { threshold: 0.1 }
    );

    const elementsToObserve = document.querySelectorAll("[data-animate]");
    elementsToObserve.forEach((el) => observerRef.current?.observe(el));

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <>
      <div className="min-h-screen bg-white">
        {/* Navigation */}
        <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="font-bold text-xl text-slate-900">
                <span className="text-orange-600">Job</span> Busters
              </div>

              {/* Desktop Menu */}
              <div className="hidden md:flex space-x-8">
                <a
                  href="#how-it-works"
                  className="text-slate-600 hover:text-slate-900 transition-colors"
                >
                  How it works
                </a>
                <a
                  href="#demo"
                  className="text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Live Demo
                </a>
                <a
                  href="#faq"
                  className="text-slate-600 hover:text-slate-900 transition-colors"
                >
                  FAQ
                </a>
                <button
                  onClick={() => router.push("/auth/login")}
                  className="px-5 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 transition-colors"
                >
                  Get Your Score Now
                </button>
              </div>

              {/* Mobile Menu Button */}
              <button
                className="md:hidden p-2"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
              <div className="md:hidden py-4 border-t border-slate-200">
                <div className="flex flex-col space-y-4">
                  <a
                    href="#how-it-works"
                    className="text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    How it works
                  </a>
                  <a
                    href="#demo"
                    className="text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    Live Demo
                  </a>
                  <a
                    href="#faq"
                    className="text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    FAQ
                  </a>
                  <button className="btn-brand px-4 py-2 rounded-lg font-medium text-left">
                    Open Prototype
                  </button>
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Hero Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h1
              className={`text-4xl md:text-6xl font-bold text-slate-900 mb-6 ${
                visibleElements.has("hero-title") ? "reveal" : "opacity-0"
              }`}
              id="hero-title"
              data-animate
            >
              Stop wasting time on ghost jobs.
            </h1>
            <p
              className={`text-xl text-slate-600 mb-8 max-w-2xl mx-auto ${
                visibleElements.has("hero-subtitle") ? "slide-up" : "opacity-0"
              }`}
              id="hero-subtitle"
              data-animate
            >
              Paste a job post and get an instant Ghost Risk Score, before you
              spend hours applying.
            </p>

            <div
              className={`space-y-4 ${
                visibleElements.has("hero-form") ? "scale-in" : "opacity-0"
              }`}
              id="hero-form"
              data-animate
            >
              <div className="max-w-2xl mx-auto">
                <textarea
                  value={jobText}
                  onChange={(e) => setJobText(e.target.value)}
                  placeholder="Paste job posting URL or full text here..."
                  className="w-full h-32 p-4 border border-slate-300 rounded-lg resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-900 placeholder:text-slate-600 caret-orange-600"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <button
                  onClick={handleAnalyze}
                  disabled={!jobText.trim() || isAnalyzing}
                  className="btn-brand px-8 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAnalyzing ? "Analyzing..." : "Get Ghost Score"}
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleSampleClick("A")}
                    className="text-sm text-orange-600 hover:text-orange-700 transition-colors"
                  >
                    Try Example A
                  </button>
                  <span className="text-slate-400">|</span>
                  <button
                    onClick={() => handleSampleClick("B")}
                    className="text-sm text-orange-600 hover:text-orange-700 transition-colors"
                  >
                    Try Example B
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-center gap-6 text-sm text-slate-600 mt-6">
                <span className="flex items-center gap-2">
                  <CheckCircle
                    className="w-4 h-4 text-green-500"
                    strokeWidth={2}
                  />
                  Free quick checks
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle
                    className="w-4 h-4 text-green-500"
                    strokeWidth={2}
                  />
                  No signup required
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Results Section */}
        {result && (
          <section
            id="results"
            className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50"
          >
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-xl p-8 shadow-lg">
                <div className="text-center mb-8">
                  <div
                    className={`inline-flex items-center gap-3 px-6 py-3 rounded-full ${
                      result.tier === "Low"
                        ? "bg-green-50 border border-green-200"
                        : result.tier === "Medium"
                        ? "bg-amber-50 border border-amber-200"
                        : "bg-red-50 border border-red-200"
                    } counter-animate`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full ${
                        result.tier === "Low"
                          ? "bg-green-500"
                          : result.tier === "Medium"
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                    ></div>
                    <span className="font-semibold text-lg text-black">
                      Ghost Risk: {currentScore}/100 - {result.tier}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-2">
                    (0 = very likely real • 100 = very likely ghost)
                  </p>
                </div>

                {/* Progress Bar */}
                <div className="mb-8">
                  <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full progress-animate ${
                        result.tier === "Low"
                          ? "bg-green-500"
                          : result.tier === "Medium"
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={
                        {
                          "--progress-width": `${result.score}%`,
                        } as React.CSSProperties
                      }
                    ></div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  {/* Red Flags */}
                  <div>
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-black">
                      <AlertTriangle
                        className="w-5 h-5 text-red-500"
                        strokeWidth={2}
                      />
                      Red Flags
                    </h3>
                    <div className="space-y-2">
                      {result.redFlags.map((flag, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-3 bg-red-50 rounded-lg"
                        >
                          <XCircle
                            className="w-4 h-4 text-red-500 flex-shrink-0"
                            strokeWidth={2}
                          />

                          <span className="text-sm text-black">{flag}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommendations */}
                  <div>
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-black">
                      <CheckCircle
                        className="w-5 h-5 text-green-500"
                        strokeWidth={2}
                      />
                      Recommendations
                    </h3>
                    <div className="space-y-2">
                      {result.recommendations.map((rec, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-3 bg-green-50 rounded-lg"
                        >
                          <CheckCircle
                            className="w-5 h-5 text-green-500"
                            strokeWidth={2}
                          />

                          <span className="text-sm text-black">{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-center mt-8">
                  <button className="bg-slate-100 hover:bg-slate-200 px-6 py-3 rounded-lg font-medium transition-colors text-black">
                    Create free account to save checks
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* How It Works Section */}
        <section
          id="how-it-works"
          className="py-20 px-4 sm:px-6 lg:px-8"
          data-animate
        >
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                How It Works
              </h2>
              <p className="text-xl text-slate-600">
                Our algorithm analyzes three key dimensions to detect ghost jobs
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  title: "Content Signals",
                  description:
                    "Specificity vs filler, salary/process presence, clear requirements",
                  icon: "📝",
                },
                {
                  title: "Metadata & Behavior",
                  description:
                    "Post age, refresh cadence, ATS link health, posting patterns",
                  icon: "📊",
                },
                {
                  title: "Cross-site Corroboration",
                  description:
                    "Match with company careers, API feeds, social verification",
                  icon: "🔍",
                },
              ].map((item, index) => (
                <div
                  key={index}
                  className="card-hover bg-white p-8 rounded-xl border border-slate-200"
                >
                  <div className="text-4xl mb-4">{item.icon}</div>
                  <h3 className="text-xl font-semibold mb-3 text-slate-600">
                    {item.title}
                  </h3>
                  <p className="text-slate-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Value Props Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  metric: "4×",
                  label: "time saved",
                  description: "Skip ghost job applications",
                },
                {
                  metric: "+38%",
                  label: "more responses*",
                  description: "Focus on real opportunities",
                },
                {
                  metric: "Free",
                  label: "quick checks",
                  description: "No signup required",
                },
              ].map((item, index) => (
                <div key={index} className="text-center">
                  <div className="text-5xl font-bold text-orange-600 mb-2">
                    {item.metric}
                  </div>
                  <div className="text-lg font-semibold mb-1 text-black">
                    {item.label}
                  </div>
                  <div className="text-slate-600">{item.description}</div>
                </div>
              ))}
            </div>
            <p className="text-center text-sm text-slate-500 mt-8">
              *Illustrative; replace with pilot data.
            </p>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-900 mb-12">
              Frequently Asked Questions
            </h2>

            <div className="space-y-6">
              {[
                {
                  q: "Is this a guarantee the job is fake?",
                  a: "No, this is a decision aid to help you prioritize your applications. High scores indicate higher risk but aren't definitive proof.",
                },
                {
                  q: "Do you store my data?",
                  a: "We don't store any data for guest users. Logged-in users can optionally save their job checks for reference.",
                },
                {
                  q: "Can companies use this tool?",
                  a: "Yes! We're developing a transparency badge and recruiter dashboard to help companies demonstrate authentic hiring practices.",
                },
                {
                  q: "How accurate is the scoring?",
                  a: "Our algorithm is continuously refined based on user feedback and real-world outcomes. It's most effective as a screening tool rather than a final judgment.",
                },
              ].map((item, index) => (
                <details
                  key={index}
                  className="group bg-white rounded-lg border border-slate-200"
                >
                  <summary className="flex justify-between items-center p-6 cursor-pointer">
                    <span className="font-semibold text-black">{item.q}</span>
                    <ChevronDown
                      className="w-5 h-5 text-orange-600 group-open:text-orange-700 transform group-open:rotate-180 transition-all"
                      strokeWidth={2}
                    />
                  </summary>
                  <div className="px-6 pb-6 text-slate-600">{item.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-slate-200">
          <div className="max-w-6xl mx-auto text-center">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="font-semibold">
                <span className="text-orange-600">Job</span>{" "}
                <span className="text-black">Busters</span>
              </div>
              <div className="flex gap-6 text-sm text-slate-600">
                <span>© 2024</span>
                <a href="#" className="hover:text-slate-900 transition-colors">
                  Privacy
                </a>
                <a href="#" className="hover:text-slate-900 transition-colors">
                  Terms
                </a>
                <a href="#" className="hover:text-slate-900 transition-colors">
                  Contact
                </a>
              </div>
            </div>
            <p className="text-sm text-slate-600 mt-4">
              Because your time is valuable, too.
            </p>
          </div>
        </footer>
      </div>

      {/* Global Styles */}
      <GlobalStyles />
    </>
  );
};

export default Index;
