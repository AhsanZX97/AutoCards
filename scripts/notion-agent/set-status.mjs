#!/usr/bin/env node
// Moves a Notion task card to a given Status option.
// Usage: node set-status.mjs <notion_page_id> <status_name>

const [, , pageId, statusName] = process.argv;

if (!pageId || !statusName) {
  console.error("Usage: set-status.mjs <notion_page_id> <status_name>");
  process.exit(1);
}

const NOTION_API_KEY = process.env.NOTION_API_KEY;
if (!NOTION_API_KEY) {
  console.error("NOTION_API_KEY is not set");
  process.exit(1);
}

const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    properties: { Status: { select: { name: statusName } } },
  }),
});

if (!res.ok) {
  console.error(`Failed to set status: ${res.status} ${await res.text()}`);
  process.exit(1);
}

console.log(`Moved ${pageId} to "${statusName}"`);
