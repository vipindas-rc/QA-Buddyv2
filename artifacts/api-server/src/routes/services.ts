import { Router, type IRouter } from "express";
import {
  GetServicesConfigResponse,
  TestServiceConnectionBody,
  TestServiceConnectionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Demo mode: skip real external calls and simulate successful connections.
// Set to false to restore real Confluence/TestIT checks below.
const DEMO_MODE = true;
const DEMO_CHECK_DELAY_MS = 700;

function demoDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DEMO_CHECK_DELAY_MS));
}

const CHECK_TIMEOUT_MS = 6000;

function maskKey(key: string): string {
  const tail = key.length > 4 ? key.slice(-4) : "";
  return "••••••••" + tail;
}

router.get("/services/config", (_req, res) => {
  const jiraEmail = process.env.JIRA_EMAIL || process.env.JIRA_USER_EMAIL || "";
  const jiraToken = process.env.JIRA_API_TOKEN || "";
  const openaiKey = process.env.OPENAI_API_KEY || "";

  const data = GetServicesConfigResponse.parse(
    DEMO_MODE
      ? {
          jira: {
            configured: true,
            account: jiraEmail || "qa.buddy@evaa.atlassian.net",
          },
          openai: {
            configured: true,
            account: openaiKey ? maskKey(openaiKey) : maskKey("demo-key-4dm0"),
          },
        }
      : {
          jira: {
            configured: Boolean(jiraEmail && jiraToken),
            ...(jiraEmail ? { account: jiraEmail } : {}),
          },
          openai: {
            configured: Boolean(openaiKey),
            ...(openaiKey ? { account: maskKey(openaiKey) } : {}),
          },
        },
  );
  res.json(data);
});

type TestOutcome = {
  ok: boolean;
  account?: string;
  reason?: "missing_field" | "unauthorized" | "unreachable" | "error";
  message: string;
};

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function testConfluence(username: string, token: string): Promise<TestOutcome> {
  if (!username.trim() || !token.trim()) {
    return {
      ok: false,
      reason: "missing_field",
      message: "Enter your Confluence username and API token.",
    };
  }
  if (DEMO_MODE) {
    await demoDelay();
    const account = username.includes("@") ? username.trim() : `${username.trim()}@evaa.atlassian.net`;
    return { ok: true, account, message: "Connected to Confluence." };
  }
  const base = (process.env.CONFLUENCE_BASE_URL || "https://evaa.atlassian.net/wiki").replace(/\/+$/, "");
  const auth = Buffer.from(`${username}:${token}`).toString("base64");
  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${base}/rest/api/user/current`, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });
  } catch {
    return {
      ok: false,
      reason: "unreachable",
      message: "Can't reach Confluence right now. Check your network and try again.",
    };
  }
  if (resp.status === 401 || resp.status === 403) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Confluence didn't accept these credentials. Check your username and API token.",
    };
  }
  if (!resp.ok) {
    return {
      ok: false,
      reason: "error",
      message: `Confluence returned an unexpected response (${resp.status}). Try again later.`,
    };
  }
  let account: string | undefined;
  try {
    const body = (await resp.json()) as { displayName?: string; email?: string };
    account = body.displayName || body.email;
  } catch {
    account = undefined;
  }
  return {
    ok: true,
    ...(account ? { account } : {}),
    message: "Connected to Confluence.",
  };
}

async function testTestit(token: string): Promise<TestOutcome> {
  if (!token.trim()) {
    return {
      ok: false,
      reason: "missing_field",
      message: "Enter your TestIT token.",
    };
  }
  if (DEMO_MODE) {
    await demoDelay();
    return { ok: true, message: "Connected to TestIT." };
  }
  const base = (process.env.TESTIT_BASE_URL || "").replace(/\/+$/, "");
  if (!base) {
    return {
      ok: false,
      reason: "unreachable",
      message: "The TestIT server address isn't set. Add TESTIT_BASE_URL to the server .env.",
    };
  }
  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${base}/api/v2/projects?take=1`, {
      headers: { Authorization: `PrivateToken ${token}`, Accept: "application/json" },
    });
  } catch {
    return {
      ok: false,
      reason: "unreachable",
      message: "Can't reach TestIT right now. Check your network and try again.",
    };
  }
  if (resp.status === 401 || resp.status === 403) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "TestIT didn't accept this token. Check the token and try again.",
    };
  }
  if (!resp.ok) {
    return {
      ok: false,
      reason: "error",
      message: `TestIT returned an unexpected response (${resp.status}). Try again later.`,
    };
  }
  return { ok: true, message: "Connected to TestIT." };
}

router.post("/services/test", async (req, res) => {
  const parsed = TestServiceConnectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(
      TestServiceConnectionResponse.parse({
        ok: false,
        reason: "missing_field",
        message: "The request is missing a service name.",
      }),
    );
    return;
  }
  const { service, username = "", token = "" } = parsed.data;
  const outcome =
    service === "confluence" ? await testConfluence(username, token) : await testTestit(token);
  res.json(TestServiceConnectionResponse.parse(outcome));
});

export default router;
