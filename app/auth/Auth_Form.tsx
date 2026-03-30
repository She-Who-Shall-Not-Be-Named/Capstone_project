"use client";
import { Mail, Lock, Apple } from "lucide-react";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import { login, signup } from "@/utils/supabase/action";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";

interface Authprops {
  title: string;
  button_txt: string;
  is_login: boolean;
  sub_text: string;
  link: string;
}

const Auth_Form = ({
  title,
  button_txt,
  is_login,
  sub_text,
  link,
}: Authprops) => {
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const result = is_login ? await login(formData) : await signup(formData);

    if ("error" in result && result.error) {
      toast.error("Invalid credentials");
      return;
    }

    toast.success(
      is_login ? "Logged in!" : "Account created! Check email for confirmation and close this window"
    );
    // if its signup page it will auto redirect to login page via middleware so the following line is fine.
    if (is_login) {
      router.push("/");
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center font-inter relative">
      {/* Background tech elements */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        {/* Top Left */}
        <div className="absolute top-0 left-0 w-32 h-32">
          <div className="absolute top-4 left-4 w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
          <div className="absolute top-6 left-8 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute top-8 left-6 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute top-5 left-6 w-6 h-0.5 bg-orange-500"></div>
          <div className="absolute top-7 left-4.5 w-0.5 h-6 bg-orange-500"></div>
        </div>

        {/* Top Right */}
        <div className="absolute top-0 right-0 w-32 h-32">
          <div className="absolute top-4 right-4 w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
          <div className="absolute top-6 right-8 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute top-8 right-6 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute top-5 right-6 w-6 h-0.5 bg-orange-500"></div>
          <div className="absolute top-7 right-4.5 w-0.5 h-6 bg-orange-500"></div>
        </div>

        {/* Bottom Left */}
        <div className="absolute bottom-0 left-0 w-32 h-32">
          <div className="absolute bottom-4 left-4 w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
          <div className="absolute bottom-6 left-8 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute bottom-8 left-6 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute bottom-5 left-6 w-6 h-0.5 bg-orange-500"></div>
          <div className="absolute bottom-7 left-4.5 w-0.5 h-6 bg-orange-500"></div>
        </div>

        {/* Bottom Right */}
        <div className="absolute bottom-0 right-0 w-32 h-32">
          <div className="absolute bottom-4 right-4 w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
          <div className="absolute bottom-6 right-8 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute bottom-8 right-6 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute bottom-5 right-6 w-6 h-0.5 bg-orange-500"></div>
          <div className="absolute bottom-7 right-4.5 w-0.5 h-6 bg-orange-500"></div>
        </div>
      </div>

      {/* Main login card */}
      <div className="w-full max-w-md mx-auto px-6 relative z-10">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          {/* Logo */}
          <div className="mb-8">
            <div
              className="
      mx-auto w-20 h-20 rounded-2xl
      
      p-2 shadow-lg ring-1 ring-orange-300/30
      flex items-center justify-center overflow-hidden
    "
              aria-label="Ghost Job Busters logo"
            >
              <img
                src="/images/job_buster_pfp.png"
                alt="Ghost Job Busters"
                className="w-full h-full object-contain"
                loading="eager"
                decoding="async"
              />
            </div>
          </div>

          {/* Welcome text */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">{title}</h1>
            <p className="text-slate-600">
              {sub_text}{" "}
              <a
                href={is_login ? "/auth/signup" : "/auth/login"}
                className="text-orange-600 hover:text-orange-500 transition-colors font-medium"
              >
                {link}
              </a>
            </p>
          </div>

          {/* Login form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email field */}
            <Input
              name="email"
              type="email"
              placeholder="email address"
              leftIcon={<Mail className="h-5 w-5 text-slate-400" />}
              required
            />

            {/* Password field */}
            <div>
              <Input
                name="password"
                type="password"
                placeholder="Password"
                leftIcon={<Lock className="h-5 w-5 text-slate-400" />}
                required
              />
              {is_login && (
                <div className="flex justify-end mt-2">
                  <a
                    href="#"
                    className="text-orange-600 hover:text-orange-500 text-sm transition-colors font-medium"
                  >
                    Forgot password?
                  </a>
                </div>
              )}
            </div>

            {/* Login button */}
            <Button type="submit" fullWidth className="py-3">
              {button_txt}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Auth_Form;
