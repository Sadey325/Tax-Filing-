"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEYS = {
  profile: "mtf_profile_v1",
  history: "mtf_history_v1",
  inputClaims: "mtf_input_claims_v1",
};

const INCOME_TAX_BRACKETS = [
  { min: 0, max: 720000, rate: 0 },
  { min: 720000, max: 1200000, rate: 0.055 },
  { min: 1200000, max: 1800000, rate: 0.08 },
  { min: 1800000, max: 2400000, rate: 0.12 },
  { min: 2400000, max: Infinity, rate: 0.15 },
];

const EWT_MONTHLY_BRACKETS = [
  { min: 0, max: 60000, rate: 0 },
  { min: 60000, max: 100000, rate: 0.055 },
  { min: 100000, max: 150000, rate: 0.08 },
  { min: 150000, max: 200000, rate: 0.12 },
  { min: 200000, max: Infinity, rate: 0.15 },
];

const GST_RATES = {
  general: 0.08,
  tourism: 0.17,
};

const emptyInputClaim = {
  supplierTin: "",
  supplierName: "",
  invoiceNumber: "",
  invoiceDate: "",
  invoiceTotalExcludingGst: "",
  gst6: "",
  gst8: "",
  gst12: "",
  gst16: "",
  taxableActivityNumber: "",
  revenueCapital: "Revenue",
  confidence: "",
  notes: "",
};

function parseMoneyToCents(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const str = String(value).trim().replaceAll(",", "");
  if (!/^\d+(\.\d{0,2})?$/.test(str)) {
    throw new Error("Enter a valid amount with up to 2 decimal places.");
  }
  const [whole, decimal = ""] = str.split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}

function centsToMvr(cents) {
  return cents / 100;
}

function formatMvr(cents) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centsToMvr(cents || 0));
}

function percentOfCents(cents, rate) {
  return Math.round(cents * rate);
}

function validateNonNegativeCents(label, cents) {
  if (!Number.isFinite(cents) || cents < 0) {
    throw new Error(`${label} must be zero or more.`);
  }
}

function calculateProgressiveTaxCents(taxableIncomeCents, brackets) {
  const taxableIncome = centsToMvr(Math.max(0, taxableIncomeCents));
  let taxMvr = 0;

  for (const bracket of brackets) {
    if (taxableIncome <= bracket.min) break;
    const upper = bracket.max === Infinity ? taxableIncome : bracket.max;
    const incomeInBracket = Math.min(taxableIncome, upper) - bracket.min;
    if (incomeInBracket > 0) taxMvr += incomeInBracket * bracket.rate;
  }

  return Math.round(taxMvr * 100);
}

function loadJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  if (typeof window !== "undefined") {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-title">Maldives Tax Filer</div>
          <div className="brand-subtitle">
            Tax, payroll, and input claim automation for Maldives businesses.
          </div>
        </div>

        <nav className="nav">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`tab ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="main">
        <div className="topbar">
          <div>
            <div className="page-title">{activeTabLabel}</div>
            <div className="page-subtitle">
              Manage tax calculations, payroll estimates, and input claims.
            </div>
          </div>
          <div className="badge">Fullstack v1.0</div>
        </div>

        <div className="mobile-nav">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`tab ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <main className="content">
        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert">{notice}</div>}

        {activeTab === "dashboard" && (
          <section className="grid two">
            <div className="card">
              <h2>Dashboard</h2>
              <p className="small">This fullstack version includes frontend calculators, local storage, MIRA input claim rows, CSV export, and a backend Gemini AI OCR endpoint.</p>
              <div className="grid three" style={{ marginTop: 20 }}>
                <div className="card"><strong>History</strong><div className="amount">{history.length}</div></div>
                <div className="card"><strong>Total Calculated</strong><div className="amount">MVR {formatMvr(totals.total)}</div></div>
                <div className="card"><strong>Input Claim Rows</strong><div className="amount">{inputClaimRows.length}</div></div>
              </div>
            </div>
            <div className="card">
              <h3>Rates currently set</h3>
              <div className="row"><span>GST general</span><strong>8%</strong></div>
              <div className="row"><span>TGST tourism</span><strong>17%</strong></div>
              <div className="row"><span>Income tax</span><strong>0–15%</strong></div>
              <div className="row"><span>EWT monthly</span><strong>0–15%</strong></div>
              <p className="small">Verify rates against official MIRA guidance before production filing.</p>
            </div>
          </section>
        )}

        {activeTab === "gst" && (
          <section className="grid two">
            <div className="card form">
              <h2>GST Calculator</h2>
              <SelectField label="GST Sector" value={gst.sector} onChange={(v) => setGst({ ...gst, sector: v })}>
                <option value="general">General sector - 8%</option>
                <option value="tourism">Tourism sector - 17%</option>
              </SelectField>
              <Field label="Total Sales (MVR)" value={gst.totalSales} onChange={(v) => setGst({ ...gst, totalSales: v })} placeholder="150000.00" />
              <Field label="Exempt Sales (MVR)" value={gst.exemptSales} onChange={(v) => setGst({ ...gst, exemptSales: v })} placeholder="0.00" />
              <Field label="Input Tax Claimed (MVR)" value={gst.inputTax} onChange={(v) => setGst({ ...gst, inputTax: v })} placeholder="5000.00" />
              <label><input type="checkbox" checked={gst.nilReturn} onChange={(e) => setGst({ ...gst, nilReturn: e.target.checked })} /> Nil return</label>
              <button className="btn" onClick={calculateGST}>Calculate GST</button>
            </div>
            <div>{gstResult ? <ResultCard {...gstResult} /> : <div className="alert">Enter GST values and calculate.</div>}</div>
          </section>
        )}

        {activeTab === "income" && (
          <section className="grid two">
            <div className="card form">
              <h2>Income Tax Calculator</h2>
              <SelectField label="Income Type" value={income.type} onChange={(v) => setIncome({ ...income, type: v })}>
                <option value="individual">Individual Employment</option>
                <option value="business">Business Owner</option>
                <option value="rental">Rental Income</option>
              </SelectField>
              <Field label="Annual Income (MVR)" value={income.amount} onChange={(v) => setIncome({ ...income, amount: v })} placeholder="1500000.00" />
              {income.type === "business" && <Field label="Business Expenses (MVR)" value={income.businessExpenses} onChange={(v) => setIncome({ ...income, businessExpenses: v })} placeholder="200000.00" />}
              <Field label="Deductions (MVR)" value={income.deductions} onChange={(v) => setIncome({ ...income, deductions: v })} placeholder="50000.00" />
              <SelectField label="Resident Status" value={income.residentStatus} onChange={(v) => setIncome({ ...income, residentStatus: v })}>
                <option value="resident">Resident</option>
                <option value="non-resident">Non-Resident</option>
              </SelectField>
              <button className="btn" onClick={calculateIncomeTax}>Calculate Income Tax</button>
            </div>
            <div>{incomeResult ? <ResultCard {...incomeResult} /> : <div className="alert">Enter income values and calculate.</div>}</div>
          </section>
        )}

        {activeTab === "ewt" && (
          <section className="grid two">
            <div className="card form">
              <h2>Employee Withholding Tax</h2>
              <Field label="Employee Name" value={ewt.employeeName} onChange={(v) => setEwt({ ...ewt, employeeName: v })} placeholder="Ahmed Hassan" />
              <Field label="Monthly Gross Salary (MVR)" value={ewt.salary} onChange={(v) => setEwt({ ...ewt, salary: v })} placeholder="35000.00" />
              <Field label="Allowances (MVR)" value={ewt.allowances} onChange={(v) => setEwt({ ...ewt, allowances: v })} placeholder="5000.00" />
              <Field label="Benefits (MVR)" value={ewt.benefits} onChange={(v) => setEwt({ ...ewt, benefits: v })} placeholder="2000.00" />
              <Field label="Employee Contribution (MVR)" value={ewt.contribution} onChange={(v) => setEwt({ ...ewt, contribution: v })} placeholder="2000.00" />
              <button className="btn" onClick={calculateEWT}>Calculate EWT</button>
            </div>
            <div>{ewtResult ? <ResultCard {...ewtResult} /> : <div className="alert">Enter EWT values and calculate.</div>}</div>
          </section>
        )}

        {activeTab === "inputClaims" && (
          <section className="grid" style={{ gap: 20 }}>
            <div className="card">
              <h2>MIRA Input Tax Claim Builder</h2>
              <p className="small">Upload a bill, scan it with AI, verify fields, then export CSV.</p>
              <div className="alert warn">The OCR result must be reviewed by the user before filing. Bills vary in layout and OCR can make mistakes.</div>

              <div className="grid two">
                <div>
                  <label className="drop">
                    <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => handleBillImageUpload(e.target.files?.[0])} />
                    <div style={{ fontSize: 34 }}>📷</div>
                    <strong>Scan or upload bill</strong>
                    <div className="small">Use mobile camera or upload an invoice image.</div>
                  </label>
                  <button className="btn" style={{ width: "100%", marginTop: 14 }} onClick={scanBillWithChatGPT} disabled={!billFile || isScanningBill}>
                    {isScanningBill ? "Scanning..." : "Scan bill with AI"}
                  </button>
                  {billPreviewUrl && <img className="preview" src={billPreviewUrl} alt="Uploaded bill preview" />}
                </div>

                <div className="form">
                  <Field label="Supplier TIN" value={inputClaimDraft.supplierTin} onChange={(v) => updateInputClaimDraft("supplierTin", v)} placeholder="Supplier TIN" />
                  <Field label="Supplier Name" value={inputClaimDraft.supplierName} onChange={(v) => updateInputClaimDraft("supplierName", v)} placeholder="Supplier name" />
                  <Field label="Supplier Invoice Number" value={inputClaimDraft.invoiceNumber} onChange={(v) => updateInputClaimDraft("invoiceNumber", v)} placeholder="Invoice number" />
                  <Field label="Invoice Date" type="date" value={inputClaimDraft.invoiceDate} onChange={(v) => updateInputClaimDraft("invoiceDate", v)} />
                  <Field label="Invoice Total excluding GST (MVR)" value={inputClaimDraft.invoiceTotalExcludingGst} onChange={(v) => updateInputClaimDraft("invoiceTotalExcludingGst", v)} placeholder="1000.00" />
                  <div className="grid two">
                    <Field label="GST charged at 6%" value={inputClaimDraft.gst6} onChange={(v) => updateInputClaimDraft("gst6", v)} placeholder="0.00" />
                    <Field label="GST charged at 8%" value={inputClaimDraft.gst8} onChange={(v) => updateInputClaimDraft("gst8", v)} placeholder="80.00" />
                    <Field label="GST charged at 12%" value={inputClaimDraft.gst12} onChange={(v) => updateInputClaimDraft("gst12", v)} placeholder="0.00" />
                    <Field label="GST charged at 16%" value={inputClaimDraft.gst16} onChange={(v) => updateInputClaimDraft("gst16", v)} placeholder="0.00" />
                  </div>
                  <Field label="Your Taxable Activity Number" value={inputClaimDraft.taxableActivityNumber} onChange={(v) => updateInputClaimDraft("taxableActivityNumber", v)} placeholder="Activity number" />
                  <SelectField label="Revenue / Capital" value={inputClaimDraft.revenueCapital} onChange={(v) => updateInputClaimDraft("revenueCapital", v)}>
                    <option value="Revenue">Revenue</option>
                    <option value="Capital">Capital</option>
                  </SelectField>
                  {inputClaimDraft.notes && <div className="alert">{inputClaimDraft.notes}</div>}
                  <button className="btn" onClick={addInputClaimRow}>Add to Input Tax Statement</button>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="actions" style={{ justifyContent: "space-between" }}>
                <h3>Input Tax Statement Rows</h3>
                <div className="actions">
                  <button className="btn secondary" onClick={exportInputClaimCsv} disabled={inputClaimRows.length === 0}>Export CSV</button>
                  <button className="btn danger" onClick={() => setInputClaimRows([])} disabled={inputClaimRows.length === 0}>Clear Rows</button>
                </div>
              </div>

              {inputClaimRows.length === 0 ? <div className="alert">No input claim rows yet.</div> : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th><th>Supplier TIN</th><th>Supplier Name</th><th>Invoice No.</th><th>Date</th>
                        <th>Invoice Total excl. GST</th><th>GST 6%</th><th>GST 8%</th><th>GST 12%</th><th>GST 16%</th>
                        <th>Activity No.</th><th>Revenue / Capital</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inputClaimRows.map((row, index) => (
                        <tr key={row.id}>
                          <td>{index + 1}</td><td>{row.supplierTin}</td><td>{row.supplierName}</td><td>{row.invoiceNumber}</td><td>{row.invoiceDate}</td>
                          <td className="money">{formatMvr(row.invoiceTotalExcludingGstCents)}</td>
                          <td className="money">{formatMvr(row.gst6Cents)}</td>
                          <td className="money">{formatMvr(row.gst8Cents)}</td>
                          <td className="money">{formatMvr(row.gst12Cents)}</td>
                          <td className="money">{formatMvr(row.gst16Cents)}</td>
                          <td>{row.taxableActivityNumber}</td><td>{row.revenueCapital}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "history" && (
          <section className="card">
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <h2>Calculation History</h2>
              <div className="actions">
                <button className="btn secondary" onClick={exportAllData}>Export All Data</button>
                <button className="btn danger" onClick={() => setHistory([])}>Clear History</button>
              </div>
            </div>
            {history.length === 0 ? <div className="alert">No calculations saved yet.</div> : history.map((item) => (
              <div className="row" key={item.id}>
                <span><strong>{item.type}</strong> — {item.title}<br /><small>{new Date(item.createdAt).toLocaleString()}</small></span>
                <span className="money">MVR {formatMvr(item.amountCents)}</span>
              </div>
            ))}
          </section>
        )}

        {activeTab === "profile" && (
          <section className="grid two">
            <div className="card form">
              <h2>Profile</h2>
              <Field label="Full Name" value={profile.name} onChange={(v) => setProfile({ ...profile, name: v })} placeholder="Enter your name" />
              <Field label="Email" value={profile.email} onChange={(v) => setProfile({ ...profile, email: v })} placeholder="your.email@example.com" />
              <Field label="TIN" value={profile.tin} onChange={(v) => setProfile({ ...profile, tin: v })} placeholder="123456789" />
              <Field label="Phone" value={profile.phone} onChange={(v) => setProfile({ ...profile, phone: v })} placeholder="+960 7777777" />
              <Field label="Business Name" value={profile.business} onChange={(v) => setProfile({ ...profile, business: v })} placeholder="Your Business" />
              <SelectField label="GST Registered?" value={profile.gstStatus} onChange={(v) => setProfile({ ...profile, gstStatus: v })}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </SelectField>
              <button className="btn" onClick={handleSaveProfile}>Save Profile</button>
            </div>
            <div className="card">
              <h3>Backend included</h3>
              <p className="small">The project includes <strong>app/api/extract-input-claim/route.js</strong>, which calls Gemini securely from the server using your <strong>GEMINI_API_KEY</strong>.</p>
              <div className="alert warn">Never put your Gemini API key in frontend React code.</div>
            </div>
          </section>
        )}

        </main>
      </section>
    </div>
  );
}
