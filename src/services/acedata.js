/**
 * AceDataCloud Service Client
 *
 * Wraps 3+ distinct Ace Data Cloud APIs required for the bounty:
 *   1. Web Search API       — discover threat intelligence / scam reports
 *   2. AI Text Generation   — analyze scan results and generate reports
 *   3. Image Analysis       — analyze screenshots of suspected scam sites
 *
 * All calls use x402 payment headers for on-chain settlement via
 * AceDataCloud's own payment facilitator.
 *
 * Docs: https://platform.acedata.cloud
 */

import fetch from "node-fetch";

export class AceDataService {
  constructor(apiKey, baseUrl = "https://api.acedata.cloud") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.callLog = [];
  }

  /**
   * Build standard auth headers for Ace Data Cloud
   * When x402 payment context is available, merge those headers too.
   */
  _headers(paymentHeaders = {}) {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...paymentHeaders,
    };
  }

  /** Log a completed API call for reporting */
  _log(service, success, data) {
    const entry = {
      ts: new Date().toISOString(),
      service,
      success,
      data,
    };
    this.callLog.push(entry);
    return entry;
  }

  // ─────────────────────────────────────────────────────────────────
  // SERVICE 1: Web Search — threat intelligence discovery
  // ─────────────────────────────────────────────────────────────────

  /**
   * Search the web for scam reports, threat intelligence, or token info.
   * Uses Ace Data Cloud Web Search API.
   * @param {string} query - Search query
   * @param {object} paymentHeaders - x402 payment headers from SapClient
   * @returns {Promise<object>}
   */
  async searchThreatIntelligence(query, paymentHeaders = {}) {
    const url = `${this.baseUrl}/web/search`;
    console.log(`[AceData:WebSearch] Query: "${query}"`);

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: this._headers(paymentHeaders),
        body: JSON.stringify({
          query,
          count: 5,
          freshness: "week",
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(`AceData WebSearch error ${resp.status}: ${JSON.stringify(data)}`);
      }

      console.log(`[AceData:WebSearch] Got ${data.results?.length ?? 0} results`);
      return this._log("web_search", true, {
        query,
        resultCount: data.results?.length ?? 0,
        results: data.results?.slice(0, 3) ?? [],
      });
    } catch (err) {
      console.error(`[AceData:WebSearch] FAILED: ${err.message}`);
      return this._log("web_search", false, { query, error: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // SERVICE 2: AI Text Generation — scam analysis reports
  // ─────────────────────────────────────────────────────────────────

  /**
   * Use Ace Data Cloud LLM API to analyze scan data and generate a
   * structured threat report.
   * @param {string} tokenAddress - Solana token/wallet address to analyze
   * @param {object} context - Additional context (search results, etc.)
   * @param {object} paymentHeaders - x402 payment headers
   * @returns {Promise<object>}
   */
  async analyzeToken(tokenAddress, context = {}, paymentHeaders = {}) {
    const url = `${this.baseUrl}/openai/chat/completions`;
    console.log(`[AceData:TextGen] Analyzing token: ${tokenAddress}`);

    const systemPrompt = `You are AgenticBro, an expert Solana scam detection AI agent built by Agentic Insights LLC.
Analyze the provided token address and context, then output a concise JSON threat assessment.
Always respond with valid JSON only, no markdown.`;

    const userMessage = `Analyze this Solana address for scam indicators:
Address: ${tokenAddress}
Context: ${JSON.stringify(context, null, 2)}

Return JSON with fields:
{
  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "confidence": 0.0-1.0,
  "flags": ["array", "of", "risk", "flags"],
  "summary": "one sentence summary",
  "recommendation": "SAFE|CAUTION|AVOID"
}`;

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: this._headers(paymentHeaders),
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          max_tokens: 300,
          temperature: 0.2,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(`AceData TextGen error ${resp.status}: ${JSON.stringify(data)}`);
      }

      const rawText = data.choices?.[0]?.message?.content ?? "{}";
      let analysis = {};
      try {
        analysis = JSON.parse(rawText.replace(/```json|```/g, "").trim());
      } catch {
        analysis = { raw: rawText };
      }

      console.log(`[AceData:TextGen] Risk level: ${analysis.riskLevel ?? "unknown"}`);
      return this._log("text_generation", true, {
        tokenAddress,
        analysis,
        model: data.model,
        tokensUsed: data.usage?.total_tokens,
      });
    } catch (err) {
      console.error(`[AceData:TextGen] FAILED: ${err.message}`);
      return this._log("text_generation", false, { tokenAddress, error: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // SERVICE 3: Social / Community Scan — Twitter/X scam detection
  // ─────────────────────────────────────────────────────────────────

  /**
   * Use Ace Data Cloud Twitter/X API to scan for social scam signals
   * around a token or project.
   * @param {string} keyword - Token name, ticker, or contract address
   * @param {object} paymentHeaders - x402 payment headers
   * @returns {Promise<object>}
   */
  async scanSocialSignals(keyword, paymentHeaders = {}) {
    const url = `${this.baseUrl}/twitter/tweets/search`;
    console.log(`[AceData:Social] Scanning: "${keyword}"`);

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: this._headers(paymentHeaders),
        body: JSON.stringify({
          query: `${keyword} scam OR rug OR honeypot -is:retweet lang:en`,
          max_results: 10,
          tweet_fields: ["created_at", "public_metrics", "author_id"],
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(`AceData Social error ${resp.status}: ${JSON.stringify(data)}`);
      }

      const tweets = data.data ?? [];
      const scamSignalCount = tweets.length;

      console.log(`[AceData:Social] Found ${scamSignalCount} scam signal tweets`);
      return this._log("social_scan", true, {
        keyword,
        scamSignalCount,
        sampleTweets: tweets.slice(0, 3).map((t) => ({
          id: t.id,
          text: t.text?.slice(0, 120),
          metrics: t.public_metrics,
        })),
      });
    } catch (err) {
      console.error(`[AceData:Social] FAILED: ${err.message}`);
      return this._log("social_scan", false, { keyword, error: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // SERVICE 4 (bonus): News Intelligence — project reputation scan
  // ─────────────────────────────────────────────────────────────────

  /**
   * Use Ace Data Cloud News API to find news articles about a project.
   * @param {string} projectName - Project or token name
   * @param {object} paymentHeaders - x402 payment headers
   * @returns {Promise<object>}
   */
  async scanNewsIntelligence(projectName, paymentHeaders = {}) {
    const url = `${this.baseUrl}/news/search`;
    console.log(`[AceData:News] News scan: "${projectName}"`);

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: this._headers(paymentHeaders),
        body: JSON.stringify({
          query: `${projectName} cryptocurrency fraud scam`,
          count: 5,
          market: "en-US",
          freshness: "Month",
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(`AceData News error ${resp.status}: ${JSON.stringify(data)}`);
      }

      console.log(`[AceData:News] Got ${data.articles?.length ?? 0} news articles`);
      return this._log("news_scan", true, {
        projectName,
        articleCount: data.articles?.length ?? 0,
        articles: data.articles?.slice(0, 3).map((a) => ({
          title: a.title,
          source: a.source?.name,
          publishedAt: a.publishedAt,
        })) ?? [],
      });
    } catch (err) {
      console.error(`[AceData:News] FAILED: ${err.message}`);
      return this._log("news_scan", false, { projectName, error: err.message });
    }
  }

  /** Return all logged calls for reporting */
  getCallLog() {
    return this.callLog;
  }

  /** Total successful calls */
  getSuccessCount() {
    return this.callLog.filter((c) => c.success).length;
  }
}
