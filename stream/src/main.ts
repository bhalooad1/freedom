import { Hono } from "hono";
import { cors } from "hono/cors";
import { Innertube, Platform, YT } from "youtubei.js";
import { USER_AGENT } from "bgutils";
import { retry } from "@std/async";

import { parseConfig } from "./lib/helpers/config.ts";
import { poTokenGenerate, type TokenMinter } from "./lib/jobs/potoken.ts";
import { youtubePlayerParsing, youtubeVideoInfo } from "./lib/helpers/youtubePlayerHandling.ts";
import { jsInterpreter } from "./lib/helpers/jsInterpreter.ts";
import { PLAYER_ID } from "./constants.ts";
import { companionRoutes, miscRoutes } from "./routes/index.ts";
import type { HonoVariables } from "./lib/types/HonoVariables.ts";

const config = await parseConfig();

let getFetchClientLocation = "getFetchClient";
if (Deno.env.get("GET_FETCH_CLIENT_LOCATION")) {
    if (Deno.env.has("DENO_COMPILED")) {
        getFetchClientLocation = Deno.mainModule.replace("src/main.ts", "") +
            Deno.env.get("GET_FETCH_CLIENT_LOCATION");
    } else {
        getFetchClientLocation = Deno.env.get(
            "GET_FETCH_CLIENT_LOCATION",
        ) as string;
    }
}
const { getFetchClient } = await import(getFetchClientLocation);

declare module "hono" {
    interface ContextVariableMap extends HonoVariables {}
}

const app = new Hono({
    getPath: (req) => new URL(req.url).pathname,
});

// Enable CORS for all routes
app.use("/*", cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Range"],
    exposeHeaders: ["Content-Length", "Content-Range", "Accept-Ranges"],
}));

let tokenMinter: TokenMinter | undefined;
let innertubeClient: Innertube;

// Setup JS interpreter for signature decryption
Platform.shim.eval = jsInterpreter;

// Initialize Innertube client
console.log("[INFO] Initializing Innertube client...");
innertubeClient = await Innertube.create({
    enable_session_cache: false,
    retrieve_player: false, // Will fetch player after PO token is ready
    fetch: getFetchClient(config),
    cookie: config.youtube_session.cookies || undefined,
    user_agent: USER_AGENT,
    player_id: PLAYER_ID,
});

// Initialize PO token in background
if (config.jobs.youtube_session.po_token_enabled) {
    console.log("[INFO] Starting PO token generation in background...");
    retry(
        poTokenGenerate.bind(poTokenGenerate, config, undefined),
        { minTimeout: 1_000, maxTimeout: 60_000, multiplier: 5, jitter: 0 },
    ).then((result) => {
        innertubeClient = result.innertubeClient;
        tokenMinter = result.tokenMinter;
        console.log("[INFO] PO token ready!");
    }).catch((err) => {
        console.error("[ERROR] Failed to initialize PO token:", err);
    });

    // Set up cron job to refresh PO token periodically
    Deno.cron(
        "regenerate youtube session",
        config.jobs.youtube_session.frequency,
        { backoffSchedule: [5_000, 15_000, 60_000, 180_000] },
        async () => {
            try {
                console.log("[INFO] Refreshing PO token...");
                const result = await poTokenGenerate(config, undefined);
                innertubeClient = result.innertubeClient;
                tokenMinter = result.tokenMinter;
                console.log("[INFO] PO token refreshed successfully");
            } catch (err) {
                console.error("[ERROR] Failed to refresh PO token:", err);
            }
        },
    );
}

// Middleware to inject client and config into context
app.use("*", async (c, next) => {
    c.set("innertubeClient", innertubeClient);
    c.set("tokenMinter", tokenMinter);
    c.set("config", config);
    c.set("metrics", undefined);
    await next();
});

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/healthz", (c) => c.json({ status: "ok" }));

// Stream endpoint - this is what the frontend calls
app.get("/stream/:id", async (c) => {
    const id = c.req.param("id");
    console.log("[STREAM] Request for video:", id);

    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return c.json({ error: "Invalid video ID" }, 400);
    }

    if (!tokenMinter) {
        console.log("[STREAM] Token minter not ready, waiting...");
        // Wait up to 30 seconds for token minter to be ready
        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            if (tokenMinter) break;
        }
        if (!tokenMinter) {
            return c.json({ error: "Service initializing, please try again" }, 503);
        }
    }

    try {
        // Get video player data using companion's parsing
        console.log("[STREAM] Getting video info...");
        const playerData = await youtubePlayerParsing({
            innertubeClient,
            videoId: id,
            config,
            tokenMinter,
            metrics: undefined,
        }) as any;

        if (playerData.playabilityStatus?.status !== "OK") {
            console.log("[STREAM] Video not playable:", playerData.playabilityStatus?.reason);
            return c.json({
                error: "Video not playable",
                reason: playerData.playabilityStatus?.reason || "Unknown",
            }, 403);
        }

        if (!playerData.streamingData) {
            return c.json({ error: "No streaming data" }, 404);
        }

        // Get the best format with both video and audio
        const formats = playerData.streamingData.formats || [];
        const adaptiveFormats = playerData.streamingData.adaptiveFormats || [];

        // Prefer formats with both video and audio
        let format = formats.find((f: any) => f.url) || formats[0];

        // If no combined format, try adaptive formats
        if (!format?.url && adaptiveFormats.length > 0) {
            format = adaptiveFormats.find((f: any) => f.url && f.mimeType?.includes("video")) || adaptiveFormats[0];
        }

        if (!format?.url) {
            return c.json({ error: "No playable format found" }, 404);
        }

        console.log("[STREAM] Using format:", format.qualityLabel || format.quality, format.mimeType);

        // Extract URL parameters for videoplayback proxy
        const videoUrl = new URL(format.url);
        const host = videoUrl.hostname;

        // Build query params for our videoplayback proxy
        const queryParams = new URLSearchParams(videoUrl.search);
        queryParams.set("host", host);
        queryParams.set("c", "WEB");

        // Remove host from original params since we pass it separately
        queryParams.delete("host");

        // Get content PO token for this video
        const contentPoToken = await tokenMinter(id);
        if (contentPoToken) {
            queryParams.set("pot", contentPoToken);
        }

        // Handle range requests
        const rangeHeader = c.req.header("Range");

        // Proxy through our videoplayback endpoint
        const proxyUrl = `/videoplayback?${queryParams.toString()}`;
        console.log("[STREAM] Proxying through videoplayback");

        // Fetch from YouTube with chunking
        const fetchClient = getFetchClient(config);

        const headersToSend: HeadersInit = {
            "accept": "*/*",
            "accept-encoding": "gzip, deflate, br",
            "accept-language": "en-us,en;q=0.5",
            "origin": "https://www.youtube.com",
            "referer": "https://www.youtube.com",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        };

        if (rangeHeader) {
            queryParams.set("range", rangeHeader.replace("bytes=", ""));
        }

        // Follow redirects
        let location = `https://${host}/videoplayback?${queryParams.toString()}`;
        let headResponse: Response | undefined;

        for (let i = 0; i < 5; i++) {
            const googlevideoResponse = await fetchClient(location, {
                method: "HEAD",
                headers: headersToSend,
                redirect: "manual",
            });

            if (googlevideoResponse.status === 403) {
                console.log("[STREAM] Got 403, trying POST method...");
                break;
            }

            if (googlevideoResponse.headers.has("Location")) {
                location = googlevideoResponse.headers.get("Location") as string;
                continue;
            } else {
                headResponse = googlevideoResponse;
                break;
            }
        }

        // Fetch the actual video content using POST (more reliable)
        console.log("[STREAM] Fetching video content...");
        const response = await fetchClient(location, {
            method: "POST",
            body: new Uint8Array([0x78, 0]), // protobuf: { 15: 0 }
            headers: headersToSend,
        });

        if (!response.ok && response.status !== 206) {
            // Try GET as fallback
            console.log("[STREAM] POST failed, trying GET...");
            const getResponse = await fetchClient(location, {
                method: "GET",
                headers: headersToSend,
            });

            if (!getResponse.ok && getResponse.status !== 206) {
                console.error("[STREAM] Failed to fetch video:", getResponse.status);
                return c.json({ error: "Failed to fetch video from YouTube" }, 502);
            }

            const responseHeaders: Record<string, string> = {
                "Content-Type": format.mimeType || "video/mp4",
                "Accept-Ranges": "bytes",
                "Access-Control-Allow-Origin": "*",
            };

            const contentLength = getResponse.headers.get("Content-Length");
            if (contentLength) responseHeaders["Content-Length"] = contentLength;

            const contentRange = getResponse.headers.get("Content-Range");
            if (contentRange) responseHeaders["Content-Range"] = contentRange;

            return new Response(getResponse.body, {
                status: getResponse.status,
                headers: responseHeaders,
            });
        }

        console.log("[STREAM] Success! Streaming video...");

        // Build response headers
        const responseHeaders: Record<string, string> = {
            "Content-Type": format.mimeType || "video/mp4",
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
        };

        const contentLength = response.headers.get("Content-Length");
        if (contentLength) responseHeaders["Content-Length"] = contentLength;

        const contentRange = response.headers.get("Content-Range");
        if (contentRange) responseHeaders["Content-Range"] = contentRange;

        return new Response(response.body, {
            status: response.status,
            headers: responseHeaders,
        });
    } catch (error: any) {
        console.error("[STREAM] Error:", error.message);
        return c.json({ error: "Stream failed", details: error.message }, 500);
    }
});

// Video info endpoint (for backward compatibility with worker)
app.get("/video-info/:id", async (c) => {
    const id = c.req.param("id");
    console.log("[INFO] Request for video info:", id);

    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return c.json({ error: "Invalid video ID" }, 400);
    }

    if (!tokenMinter) {
        return c.json({ error: "Service initializing" }, 503);
    }

    try {
        const playerData = await youtubePlayerParsing({
            innertubeClient,
            videoId: id,
            config,
            tokenMinter,
            metrics: undefined,
        }) as any;

        if (playerData.playabilityStatus?.status !== "OK") {
            return c.json({
                error: "Video not playable",
                reason: playerData.playabilityStatus?.reason,
            }, 403);
        }

        const formats = playerData.streamingData?.formats || [];
        const adaptiveFormats = playerData.streamingData?.adaptiveFormats || [];
        const format = formats.find((f: any) => f.url) || adaptiveFormats.find((f: any) => f.url);

        if (!format?.url) {
            return c.json({ error: "No format found" }, 404);
        }

        const urlObj = new URL(format.url);
        const contentPoToken = await tokenMinter(id);

        return c.json({
            url: format.url,
            host: urlObj.host,
            pot: contentPoToken,
            mimeType: format.mimeType || "video/mp4",
            qualityLabel: format.qualityLabel || format.quality,
            contentLength: format.contentLength,
        });
    } catch (error: any) {
        console.error("[INFO] Error:", error.message);
        return c.json({ error: "Failed to get video info", details: error.message }, 500);
    }
});

// Force refresh endpoint
app.post("/refresh", async (c) => {
    console.log("[REFRESH] Forcing PO token refresh...");
    try {
        const result = await poTokenGenerate(config, undefined);
        innertubeClient = result.innertubeClient;
        tokenMinter = result.tokenMinter;
        return c.json({ status: "ok" });
    } catch (error: any) {
        return c.json({ error: "Refresh failed", details: error.message }, 500);
    }
});

// Add companion routes (videoplayback proxy, etc.)
companionRoutes(app, config);
miscRoutes(app, config);

const port = config.server.port;
const host = config.server.host;

console.log(`[INFO] Stream service starting on http://${host}:${port}`);

Deno.serve({ port, hostname: host }, app.fetch);
