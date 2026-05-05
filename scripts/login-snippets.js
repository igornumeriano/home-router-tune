// home-router-tune — reusable dev-browser snippets
//
// Reference snippets for the agent to adapt. Don't import this file — paste
// the relevant function into the dev-browser session and call it. They're
// kept as plain functions (no module exports) so they work in any
// dev-browser/Playwright context, including pages opened via the MCP tool.
//
// Conventions:
//   - `page` is the dev-browser page object the agent already opened.
//   - Selectors that vary by vendor are passed as args; nothing here is
//     hard-coded to a specific firmware.
//   - Every function returns enough data for the agent to verify success
//     (current value, error message, screenshot path, etc.).

// ---------------------------------------------------------------------------
// 1. Login — generic form-post flow
// ---------------------------------------------------------------------------
// Works with most ISP gateways. Tries common selectors; vendor playbooks
// may override `userSel` / `passSel` / `submitSel` with exact ones.
async function login(page, { host, user, pass, https = true,
                              loginPath = "/",
                              userSel = 'input[type=text],input[name=username],input[name=login],input[name=user]',
                              passSel = 'input[type=password],input[name=password],input[name=pass]',
                              submitSel = 'button[type=submit],input[type=submit],button:has-text("Login"),button:has-text("Entrar"),button:has-text("Sign in")' }) {
    const url = `${https ? "https" : "http"}://${host}${loginPath}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });

    // Some firmwares show a splash before rendering the form.
    await page.waitForSelector(userSel, { timeout: 10000 });

    await page.fill(userSel, user);
    await page.fill(passSel, pass);
    await page.click(submitSel);

    // Vendor-agnostic success heuristic: the URL changes, OR a "logout"
    // affordance appears. Either signal counts.
    try {
        await Promise.race([
            page.waitForURL(/.+/, { timeout: 8000 }),
            page.waitForSelector('a:has-text("Logout"), a:has-text("Sair"), button:has-text("Logout")', { timeout: 8000 }),
        ]);
        return { ok: true, url: page.url() };
    } catch (e) {
        const msg = await page.locator('.error, .alert, [class*="error"]').first().innerText().catch(() => "");
        return { ok: false, url: page.url(), error: msg || "no success signal within 8s" };
    }
}

// ---------------------------------------------------------------------------
// 2. Capture page state — used heavily in Phase 1 discovery
// ---------------------------------------------------------------------------
// Saves a screenshot AND extracts every form field's current value, so the
// agent has both the visual and a structured snapshot.
async function snapshotPage(page, { name, screenshotDir }) {
    const path = `${screenshotDir}/${name}.png`;
    await page.screenshot({ path, fullPage: true });

    const fields = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll("input, select, textarea")) {
            if (!el.name && !el.id) continue;
            out.push({
                tag: el.tagName.toLowerCase(),
                type: el.type || null,
                name: el.name || null,
                id: el.id || null,
                value: el.type === "password" ? "<redacted>" : el.value,
                checked: el.type === "checkbox" || el.type === "radio" ? el.checked : null,
            });
        }
        return out;
    });

    return { screenshot: path, fields };
}

// ---------------------------------------------------------------------------
// 3. Native <select> picker
// ---------------------------------------------------------------------------
async function pickNativeSelect(page, { selector, value }) {
    await page.selectOption(selector, value);
    const after = await page.evaluate(s => document.querySelector(s)?.value, selector);
    return { ok: after === value, before: null, after };
}

// ---------------------------------------------------------------------------
// 4. Angular ng-select picker (Sagemcom and others)
// ---------------------------------------------------------------------------
async function pickNgSelect(page, { selector, optionText }) {
    await page.click(selector);
    await page.waitForTimeout(700);
    const opts = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".ng-dropdown-panel .ng-option"))
            .map(o => o.innerText.trim())
    );
    if (!opts.includes(optionText)) {
        // close dropdown to avoid poisoning the next interaction
        await page.keyboard.press("Escape");
        return { ok: false, available: opts, error: `option "${optionText}" not in dropdown` };
    }
    await page.locator(".ng-dropdown-panel .ng-option")
        .filter({ hasText: new RegExp(`^${optionText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
        .first()
        .click();
    return { ok: true, picked: optionText, available: opts };
}

// ---------------------------------------------------------------------------
// 5. Parse a backend-confirmed value from the page
// ---------------------------------------------------------------------------
// Most consumer firmware shows TWO things on a Wi-Fi page: the form input
// (what you'll send next) and a "current value" line (what the radio
// actually reports). Always verify against the second one.
async function readCurrentValue(page, { regex }) {
    const text = await page.locator("body").innerText();
    const m = text.match(regex);
    return m ? m[1] || m[0] : null;
}

// ---------------------------------------------------------------------------
// 6. Apply + wait + verify — the core write loop
// ---------------------------------------------------------------------------
async function applyAndVerify(page, {
    applyButtonText = "Apply",
    settleMs = 6000,
    verifyRegex,
    expected,
    pageUrl,  // re-navigate to force a fresh read
}) {
    await page.click(`button:has-text("${applyButtonText}"), input[value="${applyButtonText}"]`);
    await page.waitForTimeout(settleMs);

    if (pageUrl) {
        await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
    } else {
        await page.reload({ waitUntil: "domcontentloaded" });
    }

    const actual = await readCurrentValue(page, { regex: verifyRegex });
    return { ok: String(actual) === String(expected), actual, expected };
}

// ---------------------------------------------------------------------------
// 7. Blank-page recovery
// ---------------------------------------------------------------------------
// Several firmwares (notably Sagemcom) lock their webserver after rapid
// Apply clicks; the page renders an empty <app-root> for ~30–60 s. The
// reused page object stays poisoned even after the server recovers — the
// only fix is to abandon it and open a fresh one.
async function recoverBlankPage(browser, { host, https = true, maxWaitMs = 90000 }) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const fresh = await browser.newPage();
        try {
            await fresh.goto(`${https ? "https" : "http"}://${host}/`,
                { waitUntil: "domcontentloaded", timeout: 8000 });
            const bodyLen = await fresh.evaluate(() => document.body.innerText.length);
            if (bodyLen > 50) return fresh;  // alive again
            await fresh.close();
        } catch (_) { /* keep trying */ }
        await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error(`webserver did not recover within ${maxWaitMs} ms`);
}

// ---------------------------------------------------------------------------
// 8. Walk pages — Phase 1 reader
// ---------------------------------------------------------------------------
async function walkPages(page, { host, https = true, pages, screenshotDir }) {
    const results = [];
    for (const p of pages) {
        const url = `${https ? "https" : "http"}://${host}${p.path}`;
        try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
            const snap = await snapshotPage(page, { name: p.name, screenshotDir });
            results.push({ name: p.name, url, ...snap });
        } catch (e) {
            results.push({ name: p.name, url, error: String(e) });
        }
    }
    return results;
}
