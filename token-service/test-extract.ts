import { JsAnalyzer } from "./src/js/analyzer.ts";
import { JsExtractor } from "./src/js/extractor.ts";
import { sigMatcher, nMatcher, timestampMatcher } from "./src/js/matchers.ts";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function test() {
  // Fetch player ID
  const idRes = await fetch("https://www.youtube.com/iframe_api", {
    headers: { "User-Agent": USER_AGENT }
  });
  const idJs = await idRes.text();
  const playerIdMatch = idJs.match(/player\\?\/([a-zA-Z0-9_-]+)\\?\//);
  const playerId = playerIdMatch?.[1];
  console.log("Player ID:", playerId);

  if (!playerId) {
    console.error("Failed to get player ID");
    return;
  }

  // Fetch player.js
  const playerRes = await fetch(`https://www.youtube.com/s/player/${playerId}/player_ias.vflset/en_US/base.js`, {
    headers: { "User-Agent": USER_AGENT }
  });
  const playerJs = await playerRes.text();
  console.log("Player JS size:", (playerJs.length / 1024).toFixed(0), "KB");

  // Analyze
  const extractions = [
    { friendlyName: "sigFunction", match: sigMatcher },
    { friendlyName: "nFunction", match: nMatcher },
    { friendlyName: "signatureTimestampVar", match: timestampMatcher, collectDependencies: false },
  ];

  const analyzer = new JsAnalyzer(playerJs, { extractions });
  const extractor = new JsExtractor(analyzer);
  const result = extractor.buildScript({
    disallowSideEffectInitializers: true,
    exportRawValues: true,
    rawValueOnly: ["signatureTimestampVar"],
  });

  console.log("Exported:", result.exported);
  console.log("Script size:", (result.output.length / 1024).toFixed(1), "KB");

  // Check wrapper functions
  const nFnMatch = result.output.match(/function nFunction\(input\)\s*\{[^}]*\}/);
  console.log("nFunction wrapper:", nFnMatch?.[0] || "NOT FOUND");

  const sigFnMatch = result.output.match(/function sigFunction\(input\)\s*\{[^}]*\}/);
  console.log("sigFunction wrapper:", sigFnMatch?.[0] || "NOT FOUND");

  // Test execution
  const code = result.output + '\nreturn { n: exportedVars.nFunction("testN123"), sigType: typeof exportedVars.sigFunction };';
  try {
    const fn = new Function(code);
    const r = fn() as { n: string; sigType: string };
    console.log("Execution result:", r);
    console.log("n-transform working:", r.n && r.n !== "testN123" && r.n !== "" ? "YES ✓" : "NO ✗");
  } catch (e) {
    console.error("Execution error:", e);
  }
}

test();
