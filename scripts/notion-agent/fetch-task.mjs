#!/usr/bin/env node
// Reads a Notion task card (title + body) and writes it to a message file for Aider.
// Usage: node fetch-task.mjs <notion_page_id> <output_path>

const [, , pageId, outputPath] = process.argv;

if (!pageId || !outputPath) {
  console.error("Usage: fetch-task.mjs <notion_page_id> <output_path>");
  process.exit(1);
}

const NOTION_API_KEY = process.env.NOTION_API_KEY;
if (!NOTION_API_KEY) {
  console.error("NOTION_API_KEY is not set");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${NOTION_API_KEY}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

async function notionGet(path) {
  const res = await fetch(`https://api.notion.com${path}`, { headers });
  if (!res.ok) {
    throw new Error(`Notion API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function plainText(richText = []) {
  return richText.map((t) => t.plain_text).join("");
}

// Flattens the block types we expect on a task card into plain lines.
// Notion cards are simple free-text specs, not deeply nested docs, so a
// shallow top-level walk is enough here.
function blockToLine(block) {
  const data = block[block.type];
  if (!data || !Array.isArray(data.rich_text)) return null;
  const text = plainText(data.rich_text);
  if (!text) return null;
  if (block.type === "bulleted_list_item" || block.type === "numbered_list_item") {
    return `- ${text}`;
  }
  return text;
}

async function fetchBody(id) {
  const lines = [];
  let cursor;
  do {
    const query = cursor ? `?start_cursor=${cursor}` : "";
    const page = await notionGet(`/v1/blocks/${id}/children${query}`);
    for (const block of page.results) {
      const line = blockToLine(block);
      if (line) lines.push(line);
    }
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return lines.join("\n");
}

const page = await notionGet(`/v1/pages/${pageId}`);
const title = plainText(page.properties?.Name?.title ?? []);
const body = await fetchBody(pageId);

if (!title) {
  console.error(`Notion page ${pageId} has no title — refusing to run the agent on an empty task`);
  process.exit(1);
}

const AGENT_INSTRUCTIONS = `---

You are running unattended in CI with no shell access to external services — you can only read and edit files in this repo. If finishing this task requires something you can't do by editing files (running a CLI like \`supabase db push\` or \`stripe\` commands, changing a dashboard setting, adding an environment variable or secret, deploying an Edge Function), do not attempt it and do not pretend it's done. Instead write exact, copy-pasteable step-by-step instructions for a human into a new file at .notion-agent/MANUAL_STEPS.md, including the precise commands to run. Only create this file if manual steps are actually needed.`;

const message = [title, "", body, AGENT_INSTRUCTIONS].join("\n").trim();
const fs = await import("node:fs/promises");
await fs.writeFile(outputPath, message, "utf8");
console.log(`Wrote task "${title}" (${message.length} chars) to ${outputPath}`);
