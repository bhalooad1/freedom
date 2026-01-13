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

// Cache video URLs for 5 minutes to ensure consistent seeking
const videoCache = new Map<string, { url: string; host: string; mimeType: string; pot: string; expires: number }>();

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

// Video metadata endpoint - more reliable than Worker (has PO token)
app.get("/api/video/:id", async (c) => {
    const id = c.req.param("id");
    console.log("[VIDEO-META] Request for:", id);

    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return c.json({ error: "Invalid video ID" }, 400);
    }

    try {
        // Get video info using innertube
        const videoInfo = await innertubeClient.getInfo(id);

        if (videoInfo.playability_status?.status !== "OK") {
            return c.json({
                error: "Video not playable",
                reason: videoInfo.playability_status?.reason || "Unknown"
            }, 403);
        }

        const details = videoInfo.basic_info;
        const metadata = videoInfo.primary_info;
        const secondaryInfo = videoInfo.secondary_info;

        // Debug: log available keys
        console.log("[VIDEO-META] VideoInfo keys:", Object.keys(videoInfo));

        // Get related videos using getWatchNextContinuation or next endpoint
        const relatedVideos: any[] = [];

        try {
            // Use innertubeClient to get next/related data
            const nextInfo = await innertubeClient.getInfo(id, "WEB");
            const watchNextContents = (nextInfo as any).watch_next_feed;

            if (watchNextContents && watchNextContents.length > 0) {
                console.log("[VIDEO-META] watch_next_feed has", watchNextContents.length, "items");
                for (const item of watchNextContents.slice(0, 10)) {
                    if (item.id || item.video_id) {
                        relatedVideos.push({
                            id: item.id || item.video_id || "",
                            title: item.title?.text || item.title?.toString() || "",
                            thumbnail: item.thumbnails?.[0]?.url || "",
                            duration: item.duration?.text || "",
                            views: item.view_count?.text || item.short_view_count?.text || "",
                            channel: item.author?.name || item.authors?.[0]?.name || "",
                            uploaded: item.published?.text || "",
                        });
                    }
                }
            }

            // If still empty, try searching for similar content
            if (relatedVideos.length === 0 && details.title) {
                console.log("[VIDEO-META] Falling back to search for related");
                const searchQuery = details.title.split(" ").slice(0, 3).join(" ");
                const searchResults = await innertubeClient.search(searchQuery);

                for (const item of searchResults.videos?.slice(0, 10) || []) {
                    if (item.id && item.id !== id) {
                        relatedVideos.push({
                            id: item.id,
                            title: item.title?.text || "",
                            thumbnail: item.thumbnails?.[0]?.url || "",
                            duration: item.duration?.text || "",
                            views: item.view_count?.text || item.short_view_count?.text || "",
                            channel: item.author?.name || "",
                            uploaded: item.published?.text || "",
                        });
                    }
                }
            }
        } catch (e: any) {
            console.log("[VIDEO-META] Error getting related:", e.message);
        }

        console.log("[VIDEO-META] Found", relatedVideos.length, "related videos");

        return c.json({
            id,
            title: details.title || "",
            description: details.short_description || "",
            channel: details.author || "",
            channelId: details.channel_id || "",
            views: details.view_count?.toLocaleString() || "0",
            likes: metadata?.like_button?.like_count?.toString() || "",
            uploaded: metadata?.published?.text || "",
            thumbnail: details.thumbnail?.[0]?.url || "",
            duration: details.duration?.toString() || "",
            related: relatedVideos,
        });
    } catch (error: any) {
        console.error("[VIDEO-META] Error:", error.message);
        return c.json({ error: "Failed to get video", details: error.message }, 500);
    }
});

// Stream endpoint - simple proxy to YouTube
app.get("/stream/:id", async (c) => {
    const id = c.req.param("id");
    console.log("[STREAM] Request for video:", id);

    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return c.json({ error: "Invalid video ID" }, 400);
    }

    if (!tokenMinter) {
        console.log("[STREAM] Token minter not ready, waiting...");
        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            if (tokenMinter) break;
        }
        if (!tokenMinter) {
            return c.json({ error: "Service initializing" }, 503);
        }
    }

    try {
        // Check cache first
        let cached = videoCache.get(id);
        let videoUrl: URL;
        let host: string;
        let mimeType: string;
        let pot: string;

        if (cached && cached.expires > Date.now()) {
            // Use cached URL
            console.log("[STREAM] Using cached URL");
            videoUrl = new URL(cached.url);
            host = cached.host;
            mimeType = cached.mimeType;
            pot = cached.pot;
        } else {
            // Get fresh video info
            console.log("[STREAM] Getting video info...");
            const playerData = await youtubePlayerParsing({
                innertubeClient,
                videoId: id,
                config,
                tokenMinter,
                metrics: undefined,
            }) as any;

            if (playerData.playabilityStatus?.status !== "OK") {
                return c.json({ error: "Video not playable" }, 403);
            }

            if (!playerData.streamingData) {
                return c.json({ error: "No streaming data" }, 404);
            }

            // Get combined format (video+audio)
            const formats = playerData.streamingData.formats || [];
            let format = formats.find((f: any) => f.url && f.mimeType?.includes("mp4"));
            if (!format) format = formats.find((f: any) => f.url);

            if (!format?.url) {
                return c.json({ error: "No playable format" }, 404);
            }

            console.log("[STREAM] Using format:", format.qualityLabel || format.quality);

            videoUrl = new URL(format.url);
            host = videoUrl.hostname;
            mimeType = format.mimeType || "video/mp4";
            pot = await tokenMinter(id);

            // Cache for 5 minutes
            videoCache.set(id, {
                url: format.url,
                host,
                mimeType,
                pot,
                expires: Date.now() + 5 * 60 * 1000,
            });
        }

        // Build request
        const queryParams = new URLSearchParams(videoUrl.search);
        if (pot) queryParams.set("pot", pot);

        const headers: Record<string, string> = {
            "origin": "https://www.youtube.com",
            "referer": "https://www.youtube.com",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        };

        // Pass through range header (only as HTTP header, not query param)
        const rangeHeader = c.req.header("Range");
        if (rangeHeader) {
            console.log("[STREAM] Range requested:", rangeHeader);
            headers["Range"] = rangeHeader;
        }

        // Fetch from YouTube - let redirects happen naturally
        const fetchClient = getFetchClient(config);
        const url = `https://${host}/videoplayback?${queryParams.toString()}`;

        let response = await fetchClient(url, { method: "GET", headers, redirect: "follow" });

        // If 403, clear cache and try POST method
        if (response.status === 403) {
            console.log("[STREAM] GET returned 403, clearing cache and trying POST...");
            videoCache.delete(id);
            response = await fetchClient(url, {
                method: "POST",
                headers,
                body: new Uint8Array([0x78, 0x00]),
                redirect: "follow"
            });
        }

        // If 416 (range not satisfiable), clear cache and return error
        if (response.status === 416) {
            console.log("[STREAM] Range not satisfiable, clearing cache");
            videoCache.delete(id);
            return new Response("Range not satisfiable", {
                status: 416,
                headers: { "Access-Control-Allow-Origin": "*" }
            });
        }

        if (!response.ok && response.status !== 206) {
            console.error("[STREAM] Failed:", response.status);
            videoCache.delete(id); // Clear cache on any error
            return c.json({ error: "Failed to fetch video" }, 502);
        }

        console.log("[STREAM] Success:", response.status);
        console.log("[STREAM] Content-Range:", response.headers.get("Content-Range"));

        // Return response
        const respHeaders: Record<string, string> = {
            "Content-Type": mimeType,
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
        };

        const cl = response.headers.get("Content-Length");
        const cr = response.headers.get("Content-Range");
        if (cl) respHeaders["Content-Length"] = cl;
        if (cr) respHeaders["Content-Range"] = cr;

        return new Response(response.body, {
            status: response.status,
            headers: respHeaders,
        });
    } catch (error: any) {
        console.error("[STREAM] Error:", error.message);
        return c.json({ error: "Stream failed" }, 500);
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

// Search endpoint
app.get("/api/search", async (c) => {
    const query = c.req.query("q");
    console.log("[SEARCH] Query:", query);

    if (!query) {
        return c.json({ error: "Missing query" }, 400);
    }

    // Wait for client to be ready
    if (!tokenMinter) {
        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            if (tokenMinter) break;
        }
        if (!tokenMinter) {
            return c.json({ error: "Service initializing" }, 503);
        }
    }

    try {
        const results = await innertubeClient.search(query, { type: "video" });
        const searchResults = results.videos?.map((v: any) => ({
            id: v.id,
            title: v.title?.text || v.title,
            channel: v.author?.name || "Unknown",
            authorId: v.author?.id,
            duration: v.duration?.text || "",
            views: v.view_count?.text || v.short_view_count?.text || "",
            uploaded: v.published?.text || "",
            thumbnail: v.thumbnails?.[0]?.url || "",
        })) || [];

        return c.json({ results: searchResults });
    } catch (error: any) {
        console.error("[SEARCH] Error:", error.message);
        return c.json({ error: "Search failed" }, 500);
    }
});

// Trending cache (isolated from other caches)
let trendingCache: { videos: any[]; expires: number } | null = null;

// Trending endpoint - uses search with 1 hour cache
app.get("/api/trending", async (c) => {
    // Return cached if valid
    if (trendingCache && trendingCache.expires > Date.now()) {
        console.log("[TRENDING] Returning cached results");
        return c.json({ videos: trendingCache.videos });
    }

    console.log("[TRENDING] Fetching fresh trending...");

    // Wait for client to be ready
    if (!tokenMinter) {
        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            if (tokenMinter) break;
        }
        if (!tokenMinter) {
            return c.json({ error: "Service initializing" }, 503);
        }
    }

    try {
        // Use search for popular content
        const results = await innertubeClient.search("music", { type: "video" });

        const videos = results.videos?.slice(0, 20).map((v: any) => ({
            id: v.id,
            title: v.title?.text || v.title,
            channel: v.author?.name || "Unknown",
            duration: v.duration?.text || "",
            views: v.view_count?.text || v.short_view_count?.text || "",
            uploaded: v.published?.text || "",
            thumbnail: v.thumbnails?.[0]?.url || "",
        })) || [];

        // Cache for 1 hour
        trendingCache = {
            videos,
            expires: Date.now() + 60 * 60 * 1000,
        };

        console.log("[TRENDING] Cached", videos.length, "videos");
        return c.json({ videos });
    } catch (error: any) {
        console.error("[TRENDING] Error:", error.message);
        // Return stale cache if available
        if (trendingCache) {
            console.log("[TRENDING] Returning stale cache");
            return c.json({ videos: trendingCache.videos });
        }
        return c.json({ error: "Failed to fetch trending" }, 500);
    }
});

// Video info endpoint with related videos
app.get("/api/video/:id", async (c) => {
    const id = c.req.param("id");
    console.log("[VIDEO] Getting info for:", id);

    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return c.json({ error: "Invalid video ID" }, 400);
    }

    // Wait for client to be ready
    if (!tokenMinter) {
        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            if (tokenMinter) break;
        }
        if (!tokenMinter) {
            return c.json({ error: "Service initializing" }, 503);
        }
    }

    try {
        const info = await innertubeClient.getInfo(id);

        // Extract related videos (safely)
        const related: any[] = [];
        try {
            const relatedVideos = info.watch_next_feed || [];
            for (const item of relatedVideos.slice(0, 10)) {
                if (item?.id) {
                    related.push({
                        id: item.id,
                        title: item.title?.text || item.title || "",
                        channel: item.author?.name || "Unknown",
                        duration: item.duration?.text || "",
                        views: item.view_count?.text || item.short_view_count?.text || "",
                        thumbnail: item.thumbnails?.[0]?.url || "",
                    });
                }
            }
        } catch (e) {
            console.log("[VIDEO] Could not get related videos");
        }

        return c.json({
            id,
            title: info.basic_info?.title || "",
            channel: info.basic_info?.author || "",
            views: info.basic_info?.view_count?.toLocaleString() || "",
            likes: info.basic_info?.like_count?.toLocaleString() || "",
            uploaded: info.primary_info?.published?.text || info.primary_info?.relative_date?.text || "",
            description: info.basic_info?.short_description || "",
            related,
        });
    } catch (error: any) {
        console.error("[VIDEO] Error:", error.message);
        return c.json({ error: "Failed to get video info" }, 500);
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
