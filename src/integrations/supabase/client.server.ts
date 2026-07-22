import { createClient } from "@supabase/supabase-js";
export * from "./types"; // Types should be exported independently

/**
 * 🌍 ENVIRONMENT SENSOR 🌍
 * Automatically detects whether the app is running in Local (Dev) or Cloud (Lovable).
 */
export function getEnvStatus() {
  // A reliable way: if VITE_SUPABASE_URL contains 'supabase.co', we are in the cloud.
  // If it contains 'localhost', we are local.
  const isCloud = process.env.VITE_SUPABASE_URL?.includes("supabase.co") || false;
  const isDev = process.env.NODE_ENV === "development";

  return {
    isCloud,
    isLocal: !isCloud,
    mode: isDev ? "development" : "production",
    supabaseUrl: process.env.VITE_SUPABASE_URL || "http://localhost:15435",
  };
}

const envStatus = getEnvStatus();

// Log to help debugging
console.log(`\n======================================================`);
console.log(`🚀 IIAL GRANTS - SYSTEM TELEMETRY STARTED`);
console.log(`======================================================`);
console.log(`📍 Environment:  ${envStatus.isCloud ? "☁️ Lovable Cloud" : "💻 Local Machine"}`);
console.log(`📦 Node Mode:    ${envStatus.mode}`);
console.log(`🗄️  Supabase URL: ${envStatus.supabaseUrl}`);
console.log(`🧠 Cloud LLM:    ${process.env.GROQ_API_KEY ? "✅ Groq Ready" : "❌ Groq Missing"}`);
console.log(`======================================================\n`);

// Dynamic Supabase Admin
const url = process.env.SUPABASE_URL || "http://localhost:15435";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!serviceKey) {
  console.warn("⚠️ [Telemetry] SUPABASE_SERVICE_ROLE_KEY is missing! Backend will fail.");
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
