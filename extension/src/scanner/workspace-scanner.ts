import * as vscode from "vscode";
import { ApiCallInput } from "../analysis/types";
import { matchLine, isInsideLoop } from "./patterns";

const MAX_FILES = 500;
const WASTE_FILE_HINT = /(demo|mock|waste|leak|test|sandbox)/i;

export interface LocalWasteFinding {
  id: string;
  type: "cache" | "batch" | "redundancy" | "n_plus_one" | "rate_limit";
  severity: "high" | "medium" | "low";
  description: string;
  affectedFile: string;
  line?: number;
}

export interface ScanProgress {
  file: string;
  index: number;
  total: number;
  endpointsSoFar: number;
}

async function readUriText(uri: vscode.Uri): Promise<string> {
  const openDoc = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
  if (openDoc) {
    return openDoc.getText();
  }

  const content = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(content).toString("utf-8");
}

export async function scanWorkspace(
  onProgress?: (progress: ScanProgress) => void
): Promise<ApiCallInput[]> {
  const config = vscode.workspace.getConfiguration("eco");
  const includeGlob = config.get<string>("scanGlob", "**/*.{ts,tsx,js,jsx,py,go,java,rb}");
  const excludeGlob = config.get<string>(
    "excludeGlob",
    "**/node_modules/**,**/dist/**,**/build/**,**/.git/**,**/.next/**,**/vendor/**"
  );

  const uris = await vscode.workspace.findFiles(includeGlob, excludeGlob, MAX_FILES);
  const allCalls: ApiCallInput[] = [];

  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i];
    const relativePath = vscode.workspace.asRelativePath(uri, false);

    try {
      const text = await readUriText(uri);
      const lines = text.split("\n");

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const matches = matchLine(line);

        for (const match of matches) {
          const inLoop = isInsideLoop(lines, lineIndex);
          const snippetStart = Math.max(0, lineIndex - 2);
          const snippetEnd = Math.min(lines.length - 1, lineIndex + 2);
          const codeSnippet = lines.slice(snippetStart, snippetEnd + 1).join("\n");
          allCalls.push({
            file: relativePath,
            line: lineIndex + 1,
            method: match.method,
            url: match.url,
            library: match.library,
            frequency: inLoop ? "per-request" : "daily",
            codeSnippet,
          });
        }
      }
    } catch {
      // Skip files that can't be read
    }

    onProgress?.({
      file: relativePath,
      index: i,
      total: uris.length,
      endpointsSoFar: allCalls.length,
    });
  }

  return allCalls;
}

interface FileContext {
  path: string;
  text: string;
  lines: string[];
}

function findLine(lines: string[], pattern: RegExp): number | undefined {
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) return i + 1;
  }
  return undefined;
}

function has(pattern: RegExp, text: string): boolean {
  return pattern.test(text);
}

function makeFinding(
  file: FileContext,
  id: string,
  type: LocalWasteFinding["type"],
  severity: LocalWasteFinding["severity"],
  description: string,
  linePattern: RegExp
): LocalWasteFinding {
  return {
    id: `${id}:${file.path}`,
    type,
    severity,
    description,
    affectedFile: file.path,
    line: findLine(file.lines, linePattern),
  };
}

function detectInFile(file: FileContext): LocalWasteFinding[] {
  const findings: LocalWasteFinding[] = [];
  const { text } = file;
  const fetchCallCount = (text.match(/\bfetch\(/g) ?? []).length;

  if (has(/Promise\.all\([\s\S]{0,300}length:\s*streamCount/gi, text) && has(/streamCount\s*=\s*200/g, text)) {
    findings.push(
      makeFinding(
        file,
        "local-concurrent-stream-fanout",
        "n_plus_one",
        "high",
        "High fan-out detected: 200 concurrent streams are launched per user action with Promise.all, which can trigger severe request storms.",
        /streamCount\s*=\s*200/
      )
    );
  }

  if (has(/randomInt\(\s*10\s*,\s*30\s*\)/g, text) && has(/jitterThatIncreasesCalls|baseCalls\s*\+\s*jitter/gi, text)) {
    findings.push(
      makeFinding(
        file,
        "local-random-call-amplification",
        "n_plus_one",
        "high",
        "Call amplification detected: per-stream call volume is randomized and explicitly increased with additional jitter.",
        /randomInt\(\s*10\s*,\s*30\s*\)/
      )
    );
  }

  if (has(/for\s*\(\s*let\s+attempt\s*=\s*0;\s*attempt\s*<\s*20/gi, text)) {
    findings.push(
      makeFinding(
        file,
        "local-excessive-retry-loop",
        "rate_limit",
        "high",
        "Excessive retry loop detected: up to 20 attempts per call can drastically increase request volume and cost.",
        /attempt\s*<\s*20/
      )
    );
  }

  if (has(/duplicateFanout\s*=|Array\.from\(\{\s*length:\s*duplicateFanout/gi, text)) {
    findings.push(
      makeFinding(
        file,
        "local-broken-backoff-fanout",
        "rate_limit",
        "high",
        "Broken backoff pattern detected: failures increase parallel duplicate requests, amplifying load instead of reducing it.",
        /duplicateFanout/
      )
    );
  }

  if (has(/AbortSignal\.timeout\(\s*1\s*\)/g, text) && has(/attempt\s*<\s*20/gi, text)) {
    findings.push(
      makeFinding(
        file,
        "local-timeout-retry-storm",
        "rate_limit",
        "high",
        "Retry storm risk detected: 1ms timeout combined with aggressive retries/fan-out is likely to create cascading failures.",
        /AbortSignal\.timeout\(\s*1\s*\)/
      )
    );
  }

  if (fetchCallCount > 0 && !has(/cache|memo|dedupe|circuit breaker|breaker/gi, text)) {
    findings.push(
      makeFinding(
        file,
        "local-missing-cache-dedupe-breaker",
        "cache",
        "medium",
        "Resilience/cost controls appear missing: no clear caching, deduplication, or circuit breaker behavior was detected near frequent API calls.",
        /\bfetch\(/
      )
    );
  }

  if (has(/new\s+Agent\(/g, text) && has(/function\s+noisyApiCall/gi, text)) {
    findings.push(
      makeFinding(
        file,
        "local-client-reinit-per-call",
        "redundancy",
        "medium",
        "HTTP client re-initialization detected inside a hot call path; reuse a shared client/dispatcher to avoid connection churn.",
        /new\s+Agent\(/
      )
    );
  }

  if (has(/loadConfigEveryCall\(\)/g, text) && has(/function\s+noisyApiCall/gi, text)) {
    findings.push(
      makeFinding(
        file,
        "local-config-reload-per-call",
        "redundancy",
        "medium",
        "Configuration is reloaded on every API call, adding avoidable per-request overhead.",
        /loadConfigEveryCall\(\)/
      )
    );
  }

  if (has(/\[FULL_PROMPT_LOG\]|\[FULL_RESPONSE_LOG\]/g, text)) {
    findings.push(
      makeFinding(
        file,
        "local-full-payload-logging",
        "rate_limit",
        "medium",
        "Verbose full prompt/response logging detected on hot paths; this increases IO cost and can leak sensitive data.",
        /\[FULL_PROMPT_LOG\]|\[FULL_RESPONSE_LOG\]/
      )
    );
  }

  const stringifyParseCount = (text.match(/JSON\.parse\(JSON\.stringify\(/g) ?? []).length;
  if (stringifyParseCount >= 3) {
    findings.push(
      makeFinding(
        file,
        "local-redundant-json-transform",
        "redundancy",
        "medium",
        "Repeated JSON stringify/parse chains detected without clear need, creating unnecessary CPU overhead.",
        /JSON\.parse\(JSON\.stringify\(/
      )
    );
  }

  if (has(/DISABLE_CALLS/g, text) && has(/still calling anyway/gi, text)) {
    findings.push(
      makeFinding(
        file,
        "local-inverted-disable-flag",
        "rate_limit",
        "high",
        "Feature-flag inversion detected: DISABLE_CALLS appears set but calls still proceed.",
        /DISABLE_CALLS/
      )
    );
  }

  if (has(/sharedMutableResponses/g, text) && has(/sharedMutableResponses\.push/g, text) && !has(/shift\(|splice\(|slice\(\s*-?\d+\s*\)/g, text)) {
    findings.push(
      makeFinding(
        file,
        "local-unbounded-global-growth",
        "redundancy",
        "high",
        "Unbounded shared mutable global array growth detected; memory pressure can accumulate indefinitely under load.",
        /sharedMutableResponses/
      )
    );
  }

  if (has(/setInterval\(/g, text) && has(/startRunawayLeakLoop|leakLoopStarted|LEAK_LOOP/gi, text)) {
    findings.push(
      makeFinding(
        file,
        "local-runaway-background-loop",
        "n_plus_one",
        "high",
        "Runaway background loop detected: recurring leaked calls continue indefinitely after first trigger.",
        /setInterval\(/
      )
    );
  }

  if (has(/calls_per_user_action|calls_per_minute_at_concurrency|projected_monthly_calls|projected_monthly_cost/gi, text)) {
    findings.push(
      makeFinding(
        file,
        "local-waste-metrics-present",
        "rate_limit",
        "low",
        "Waste metrics are emitted (calls per action/minute and projected monthly cost), indicating code paths with explicit high-volume behavior modeling.",
        /calls_per_user_action|projected_monthly_cost/
      )
    );
  }

  return findings;
}

export async function detectLocalWastePatterns(): Promise<LocalWasteFinding[]> {
  const config = vscode.workspace.getConfiguration("eco");
  const includeGlob = config.get<string>("scanGlob", "**/*.{ts,tsx,js,jsx,py,go,java,rb}");
  const excludeGlob = config.get<string>(
    "excludeGlob",
    "**/node_modules/**,**/dist/**,**/build/**,**/.git/**,**/.next/**,**/vendor/**"
  );

  const uris = await vscode.workspace.findFiles(includeGlob, excludeGlob, MAX_FILES);
  const findings: LocalWasteFinding[] = [];

  for (const uri of uris) {
    try {
      const relativePath = vscode.workspace.asRelativePath(uri, false);
      const text = await readUriText(uri);
      const lines = text.split("\n");
      const file: FileContext = { path: relativePath, text, lines };

      if (WASTE_FILE_HINT.test(relativePath) || /noisyApiCall|runWastefulStream|projectedWasteReport/.test(text)) {
        findings.push(...detectInFile(file));
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return findings;
}
