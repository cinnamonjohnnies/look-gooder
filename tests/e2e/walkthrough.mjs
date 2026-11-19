// Browser walkthrough of Phase 1 using generated shapes (never garment photos).
// Usage: BASE=http://localhost:3000 node tests/e2e/walkthrough.mjs
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/shots";
const PW = process.env.APP_PASSWORD ?? "dev-password";
mkdirSync(OUT, { recursive: true });
mkdirSync("/tmp/fixtures", { recursive: true });

const SHAPES = [
  { x: 80, y: 360, w: 240, h: 150, c: "#e8742a" },
  { x: 380, y: 360, w: 240, h: 150, c: "#e7c62e" },
  { x: 680, y: 360, w: 240, h: 150, c: "#f4f4f4" },
  { x: 980, y: 360, w: 240, h: 150, c: "#1d1d1d" },
  { x: 1280, y: 360, w: 240, h: 150, c: "#7a4a2a" },
];
async function fixtures() {
  const shelf = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#b9b4aa" } })
    .composite(SHAPES.map((s) => ({
      input: Buffer.from(`<svg width="${s.w}" height="${s.h}"><rect rx="40" width="${s.w}" height="${s.h}" fill="${s.c}"/></svg>`),
      left: s.x, top: s.y,
    }))).jpeg().toBuffer();
  const room = await sharp({ create: { width: 1400, height: 1000, channels: 3, background: "#6b7d6a" } }).jpeg().toBuffer();
  const single = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#eee8dc" } })
    .composite([{ input: Buffer.from(`<svg width="500" height="700"><rect width="500" height="700" rx="30" fill="#f6efe0" stroke="#999" stroke-width="6"/></svg>`), left: 200, top: 250 }])
    .png().toBuffer();
  writeFileSync("/tmp/fixtures/shelf.jpg", shelf);
  writeFileSync("/tmp/fixtures/shelf-again.jpg", shelf);
  writeFileSync("/tmp/fixtures/living-room.jpg", room);
  writeFileSync("/tmp/fixtures/single.png", single);
}

const log = (...a) => console.log("•", ...a);
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

await fixtures();
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => fail(`page error: ${e.message}`));
page.on("dialog", (d) => d.accept());

await page.goto(`${BASE}/login`);
await page.fill("#password", "wrong");
await page.click("button");
await page.getByText("That password is not right").waitFor();
await page.fill("#password", PW);
await page.click("button");
await page.waitForURL("**/import");
await page.screenshot({ path: `${OUT}/01-import-empty.png`, fullPage: true });
log("signed in");

await page.setInputFiles('[data-testid="file-input"]', [
  "/tmp/fixtures/shelf.jpg", "/tmp/fixtures/living-room.jpg", "/tmp/fixtures/single.png",
]);
await page.getByText("Uploads finished").waitFor({ timeout: 30000 });
await page.setInputFiles('[data-testid="file-input"]', ["/tmp/fixtures/shelf-again.jpg"]);
await page.getByText("Already uploaded as shelf.jpg").waitFor({ timeout: 30000 });
log("upload + duplicate detection ok");
await page.reload();
await page.screenshot({ path: `${OUT}/02-import-uploaded.png`, fullPage: true });
const cards = await page.locator("main ul li a").count();
if (cards !== 3) fail(`expected 3 photos, saw ${cards}`);

// ---- multi-item photo: five shoes, five boxes, five records
await page.getByText("shelf.jpg").first().click();
await page.waitForURL("**/import/*");
await page.getByRole("button", { name: "Done drawing" }).waitFor(); // new photo opens ready to draw
await page.getByRole("button", { name: "Multiple items" }).click();
await page.waitForTimeout(500);
const canvas = page.getByTestId("canvas");
const bb = await canvas.boundingBox();
const sx = bb.width / 1600, sy = bb.height / 1000;
const colors = ["orange", "yellow", "white", "black", "brown"];
for (let i = 0; i < SHAPES.length; i++) {
  const s = SHAPES[i];
  await page.mouse.move(bb.x + (s.x - 15) * sx, bb.y + (s.y - 15) * sy);
  await page.mouse.down();
  await page.mouse.move(bb.x + (s.x + s.w / 2) * sx, bb.y + (s.y + s.h / 2) * sy, { steps: 4 });
  await page.mouse.move(bb.x + (s.x + s.w + 15) * sx, bb.y + (s.y + s.h + 15) * sy, { steps: 4 });
  await page.mouse.up();
  await page.locator("#qf-category").waitFor();
  if (i === 0) await page.screenshot({ path: `${OUT}/03-review-new-item.png` });
  await page.selectOption("#qf-category", "shoes");
  await page.fill("#qf-name", "Test sneaker");
  await page.fill("#qf-brand", "Adidas");
  await page.fill("#qf-color", colors[i]);
  await page.getByRole("button", { name: "Create & verify from photo" }).click();
  await page.locator("#qf-category").waitFor({ state: "detached" });
  await page.waitForTimeout(300);
}
await page.getByText(/5 boxed · 5 linked/).waitFor();
let badge = await page.locator("h1 + span").innerText();
if (badge !== "In progress") fail(`before confirming, expected In progress, saw ${badge}`);
await page.getByText("Every wardrobe item in this photo is boxed.").click();
await page.locator("h1 + span", { hasText: "Audited" }).waitFor();
await page.screenshot({ path: `${OUT}/04-review-audited.png` });
log("5-item photo → 5 records, audited only after confirmation");

// ---- confirming the photo switches to review mode
await page.getByRole("button", { name: "Draw boxes" }).waitFor();
log("confirmed photo switched to Done drawing");

// ---- reopening a boxed photo defaults to review mode, yet boxes still move and resize
await page.reload();
await page.getByRole("button", { name: "Draw boxes" }).waitFor();
const box = page.locator("[data-region]").first();
const before = await box.boundingBox();
await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);
await page.locator("[data-corner='e']").waitFor();
await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
await page.mouse.down();
await page.mouse.move(before.x + before.width / 2 + 20, before.y + before.height / 2 + 10, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(800);
const e = await page.locator("[data-corner='e']").boundingBox();
await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
await page.mouse.down();
await page.mouse.move(e.x + e.width / 2 + 40, e.y + e.height / 2, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(800);
await page.reload();
await page.getByText(/5 boxed · 5 linked/).waitFor();
const after = await page.locator("[data-region]").first().boundingBox();
if (!(after.x > before.x + 10 && after.width > before.width + 25)) fail(`move/resize not saved: ${JSON.stringify({ before, after })}`);
await page.locator("[data-region]").first().click();
await page.screenshot({ path: `${OUT}/04b-review-handles.png` });
log("boxes move and resize in review mode, links intact");

// ---- dragging empty space in review mode does not create a box
const cb = await page.getByTestId("canvas").boundingBox();
await page.mouse.move(cb.x + 20, cb.y + 20);
await page.mouse.down();
await page.mouse.move(cb.x + 120, cb.y + 120, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(600);
await page.getByText(/5 boxed · 5 linked/).waitFor();
log("no accidental boxes in review mode");

// ---- living-room photo: unrelated, audited, never in closet
await page.goto(`${BASE}/import`);
await page.getByText("living-room.jpg").click();
await page.getByRole("button", { name: "Unrelated" }).click();
await page.locator("h1 + span", { hasText: "Audited" }).waitFor();
log("unrelated photo audited with no items");

// ---- dashboard truthfulness: single.png untouched → not complete
await page.goto(`${BASE}/import`);
const banner = await page.getByTestId("audit-banner").innerText();
if (!banner.includes("Audit not complete")) fail(`banner should say not complete: ${banner}`);
await page.screenshot({ path: `${OUT}/05-import-progress.png`, fullPage: true });
log("banner:", banner.replace(/\s+/g, " "));

// ---- closet
await page.goto(`${BASE}/closet`);
const items = await page.locator("main ul li").count();
if (items !== 5) fail(`closet should have 5 items, saw ${items}`);
await page.screenshot({ path: `${OUT}/06-closet.png`, fullPage: true });
await page.goto(`${BASE}/closet?color=orange`);
const orange = await page.locator("main ul li").count();
if (orange !== 1) fail(`color filter expected 1, saw ${orange}`);

// ---- item detail: edit, history
await page.goto(`${BASE}/closet`);
await page.locator("main ul li a").first().click();
await page.fill("#f-material", "suede");
await page.getByRole("button", { name: "Save changes" }).click();
await page.getByText("Saved. Change recorded in history.").waitFor();
await page.reload();
await page.getByText("material: empty → suede").waitFor();
if ((await page.getByText("Crop adjusted").count()) !== 2) fail("expected two crop adjustments in history");
  await page.getByText("status: Candidate → Photo verified").waitFor();
await page.screenshot({ path: `${OUT}/07-item-detail.png`, fullPage: true });
log("item edit recorded in history");

// ---- checklist
await page.goto(`${BASE}/import/checklist`);
await page.getByRole("button", { name: "Load starter checklist" }).click();
await page.getByText("Black Chelsea boots").waitFor();
await page.screenshot({ path: `${OUT}/08-checklist.png`, fullPage: true });
log("checklist loaded");

// ---- mobile review layout
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await m.context().addCookies(await page.context().cookies());
await m.goto(`${BASE}/import`);
await m.screenshot({ path: `${OUT}/09-mobile-import.png`, fullPage: true });
await m.getByText("single.png").click();
await m.waitForURL("**/import/*");
await m.screenshot({ path: `${OUT}/10-mobile-review.png`, fullPage: true });

await browser.close();
console.log(process.exitCode ? "WALKTHROUGH FAILED" : "WALKTHROUGH PASSED");
