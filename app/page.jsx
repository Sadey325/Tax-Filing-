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

const tabs = [
  { key: "dashboard", label: "Dashboard" },
  { key: "gst", label: "GST" },
  { key: "income", label: "Income Tax" },
  { key: "ewt", label: "EWT" },
  { key: "inputClaims", label: "Input Claims" },
  { key: "history", label: "History" },
  { key: "profile", label: "Profile" },
];

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

    if (incomeInBracket > 0) {
      taxMvr += incomeInBracket * bracket.rate;
    }
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
    <label>
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}

function ResultCard({ title, amountCents, breakdown = [] }) {
  return (
    <div className="result">
      <div className="small">Calculated result</div>
      <div className="amount">MVR {formatMvr(amountCents)}</div>
      <div className="small">{title}</div>

      {breakdown.length > 0 && (
        <div className="breakdown">
          <strong>Breakdown</strong>
          {breakdown.map((item) => (
            <div className="row" key={item.label}>
              <span>{item.label}</span>
              <span className="money">MVR {formatMvr(item.valueCents)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, helper }) {
  return (
    <div className="card-flat">
      <div className="stat-label">{label}</div>
      <div className="amount">{value}</div>
      {helper && <div className="small">{helper}</div>}
    </div>
  );
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [profile, setProfile] = useState({
    name: "",
    email: "",
    tin: "",
    phone: "",
    business: "",
    gstStatus: "no",
  });

  const [history, setHistory] = useState([]);

  const [gst, setGst] = useState({
    sector: "general",
    totalSales: "",
    exemptSales: "",
    inputTax: "",
    nilReturn: false,
  });
  const [gstResult, setGstResult] = useState(null);

  const [income, setIncome] = useState({
    type: "individual",
    amount: "",
    businessExpenses: "",
    deductions: "",
    residentStatus: "resident",
  });
  const [incomeResult, setIncomeResult] = useState(null);

  const [ewt, setEwt] = useState({
    employeeName: "",
    salary: "",
    allowances: "",
    benefits: "",
    contribution: "",
  });
  const [ewtResult, setEwtResult] = useState(null);

  const [inputClaimDraft, setInputClaimDraft] = useState(emptyInputClaim);
  const [inputClaimRows, setInputClaimRows] = useState([]);
  const [billPreviewUrl, setBillPreviewUrl] = useState("");
  const [billFile, setBillFile] = useState(null);
  const [isScanningBill, setIsScanningBill] = useState(false);

  useEffect(() => {
    setProfile(loadJson(STORAGE_KEYS.profile, profile));
    setHistory(loadJson(STORAGE_KEYS.history, []));
    setInputClaimRows(loadJson(STORAGE_KEYS.inputClaims, []));
  }, []);

  useEffect(() => {
    saveJson(STORAGE_KEYS.history, history);
  }, [history]);

  useEffect(() => {
    saveJson(STORAGE_KEYS.inputClaims, inputClaimRows);
  }, [inputClaimRows]);

  const totals = useMemo(() => {
    return history.reduce(
      (acc, item) => {
        acc.total += item.amountCents || 0;
        acc[item.type] = (acc[item.type] || 0) + (item.amountCents || 0);
        return acc;
      },
      { total: 0 }
    );
  }, [history]);

  const activeTabLabel =
    tabs.find((tab) => tab.key === activeTab)?.label || "Dashboard";

  function runSafely(action) {
    try {
      setError("");
      setNotice("");
      action();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    }
  }

  function addHistory(record) {
    setHistory((prev) =>
      [
        {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          ...record,
        },
        ...prev,
      ].slice(0, 200)
    );
  }

  function calculateGST() {
    runSafely(() => {
      if (gst.nilReturn) {
        const result = {
          title: "Nil Return - No tax due",
          amountCents: 0,
          breakdown: [],
        };

        setGstResult(result);
        addHistory({ type: "GST", ...result, inputs: gst });
        return;
      }

      const totalSales = parseMoneyToCents(gst.totalSales);
      const exemptSales = parseMoneyToCents(gst.exemptSales);
      const inputTax = parseMoneyToCents(gst.inputTax);

      validateNonNegativeCents("Total sales", totalSales);
      validateNonNegativeCents("Exempt sales", exemptSales);
      validateNonNegativeCents("Input tax", inputTax);

      if (exemptSales > totalSales) {
        throw new Error("Exempt sales cannot be greater than total sales.");
      }

      const taxableSales = totalSales - exemptSales;
      const gstRate = GST_RATES[gst.sector];
      const outputTax = percentOfCents(taxableSales, gstRate);
      const netGst = outputTax - inputTax;

      const result = {
        title: netGst < 0 ? "GST Refund Due" : "Net GST Payable",
        amountCents: Math.abs(netGst),
        breakdown: [
          { label: "Total Sales", valueCents: totalSales },
          { label: "Exempt Sales", valueCents: exemptSales },
          { label: "Taxable Sales", valueCents: taxableSales },
          {
            label: `Output Tax (${(gstRate * 100).toFixed(0)}%)`,
            valueCents: outputTax,
          },
          { label: "Input Tax Claimed", valueCents: inputTax },
        ],
      };

      setGstResult(result);
      addHistory({ type: "GST", ...result, inputs: gst });
    });
  }

  function calculateIncomeTax() {
    runSafely(() => {
      const grossIncome = parseMoneyToCents(income.amount);
      const businessExpenses =
        income.type === "business"
          ? parseMoneyToCents(income.businessExpenses)
          : 0;
      const deductions = parseMoneyToCents(income.deductions);

      validateNonNegativeCents("Annual income", grossIncome);
      validateNonNegativeCents("Business expenses", businessExpenses);
      validateNonNegativeCents("Deductions", deductions);

      const taxableIncome = Math.max(
        0,
        grossIncome - businessExpenses - deductions
      );
      const taxPayable = calculateProgressiveTaxCents(
        taxableIncome,
        INCOME_TAX_BRACKETS
      );
      const effectiveRate =
        taxableIncome === 0 ? 0 : (taxPayable / taxableIncome) * 100;

      const result = {
        title: `Income Tax (Effective: ${effectiveRate.toFixed(2)}%)`,
        amountCents: taxPayable,
        breakdown: [
          { label: "Gross Income", valueCents: grossIncome },
          { label: "Business Expenses", valueCents: businessExpenses },
          { label: "Other Deductions", valueCents: deductions },
          { label: "Taxable Income", valueCents: taxableIncome },
        ],
      };

      setIncomeResult(result);
      addHistory({ type: "Income Tax", ...result, inputs: income });
    });
  }

  function calculateEWT() {
    runSafely(() => {
      const salary = parseMoneyToCents(ewt.salary);
      const allowances = parseMoneyToCents(ewt.allowances);
      const benefits = parseMoneyToCents(ewt.benefits);
      const contribution = parseMoneyToCents(ewt.contribution);

      validateNonNegativeCents("Salary", salary);
      validateNonNegativeCents("Allowances", allowances);
      validateNonNegativeCents("Benefits", benefits);
      validateNonNegativeCents("Contribution", contribution);

      const totalRemuneration = Math.max(
        0,
        salary + allowances + benefits - contribution
      );
      const tax = calculateProgressiveTaxCents(
        totalRemuneration,
        EWT_MONTHLY_BRACKETS
      );
      const netAfterTax = totalRemuneration - tax;
      const employeeName = ewt.employeeName.trim() || "Employee";

      const result = {
        title: `EWT to Withhold (${employeeName})`,
        amountCents: tax,
        breakdown: [
          { label: "Gross Salary", valueCents: salary },
          { label: "Allowances", valueCents: allowances },
          { label: "Benefits", valueCents: benefits },
          { label: "Contribution", valueCents: contribution },
          { label: "Total Remuneration", valueCents: totalRemuneration },
          { label: "Net After Tax", valueCents: netAfterTax },
        ],
      };

      setEwtResult(result);
      addHistory({ type: "EWT", ...result, inputs: ewt });
    });
  }

  function handleSaveProfile() {
    saveJson(STORAGE_KEYS.profile, profile);
    setNotice("Profile saved.");
    setError("");
  }

  function handleBillImageUpload(file) {
    if (!file) return;

    setBillFile(file);
    setBillPreviewUrl(URL.createObjectURL(file));
    setError("");
    setNotice("");
  }

  async function scanBillWithAI() {
    if (!billFile) {
      setError("Upload or scan a bill first.");
      return;
    }

    setIsScanningBill(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("bill", billFile);

      const response = await fetch("/api/extract-input-claim", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || "Bill scan failed.");
      }

      setInputClaimDraft((prev) => ({
        ...prev,
        supplierTin: data.supplierTin || prev.supplierTin,
        supplierName: data.supplierName || prev.supplierName,
        invoiceNumber: data.invoiceNumber || prev.invoiceNumber,
        invoiceDate: data.invoiceDate || prev.invoiceDate,
        invoiceTotalExcludingGst:
          data.invoiceTotalExcludingGst || prev.invoiceTotalExcludingGst,
        gst6: data.gst6 || prev.gst6,
        gst8: data.gst8 || prev.gst8,
        gst12: data.gst12 || prev.gst12,
        gst16: data.gst16 || prev.gst16,
        revenueCapital: data.revenueCapital || prev.revenueCapital,
        confidence: data.confidence || "",
        notes: data.notes || "",
      }));

      setNotice(
        `Invoice data extracted successfully. Confidence: ${
          data.confidence || "unknown"
        }. Please verify before saving.`
      );
    } catch (err) {
      setError(err.message || "Could not scan the bill.");
    } finally {
      setIsScanningBill(false);
    }
  }

  function updateInputClaimDraft(field, value) {
    setInputClaimDraft((prev) => ({ ...prev, [field]: value }));
  }

  function addInputClaimRow() {
    runSafely(() => {
      const invoiceTotal = parseMoneyToCents(
        inputClaimDraft.invoiceTotalExcludingGst
      );
      const gst6 = parseMoneyToCents(inputClaimDraft.gst6);
      const gst8 = parseMoneyToCents(inputClaimDraft.gst8);
      const gst12 = parseMoneyToCents(inputClaimDraft.gst12);
      const gst16 = parseMoneyToCents(inputClaimDraft.gst16);

      validateNonNegativeCents("Invoice total excluding GST", invoiceTotal);
      validateNonNegativeCents("GST charged at 6%", gst6);
      validateNonNegativeCents("GST charged at 8%", gst8);
      validateNonNegativeCents("GST charged at 12%", gst12);
      validateNonNegativeCents("GST charged at 16%", gst16);

      if (!inputClaimDraft.supplierTin.trim()) {
        throw new Error("Supplier TIN is required.");
      }
      if (!inputClaimDraft.supplierName.trim()) {
        throw new Error("Supplier name is required.");
      }
      if (!inputClaimDraft.invoiceNumber.trim()) {
        throw new Error("Supplier invoice number is required.");
      }
      if (!inputClaimDraft.invoiceDate) {
        throw new Error("Invoice date is required.");
      }
      if (!inputClaimDraft.taxableActivityNumber.trim()) {
        throw new Error("Your taxable activity number is required.");
      }

      const row = {
        id: crypto.randomUUID(),
        supplierTin: inputClaimDraft.supplierTin.trim(),
        supplierName: inputClaimDraft.supplierName.trim(),
        invoiceNumber: inputClaimDraft.invoiceNumber.trim(),
        invoiceDate: inputClaimDraft.invoiceDate,
        invoiceTotalExcludingGstCents: invoiceTotal,
        gst6Cents: gst6,
        gst8Cents: gst8,
        gst12Cents: gst12,
        gst16Cents: gst16,
        taxableActivityNumber: inputClaimDraft.taxableActivityNumber.trim(),
        revenueCapital: inputClaimDraft.revenueCapital,
      };

      setInputClaimRows((prev) => [...prev, row]);
      setInputClaimDraft({
        ...emptyInputClaim,
        taxableActivityNumber: row.taxableActivityNumber,
      });
      setNotice("Input claim row added.");
    });
  }

  function exportInputClaimCsv() {
    const headers = [
      "#",
      "Supplier TIN",
      "Supplier Name",
      "Supplier Invoice Number",
      "Invoice Date",
      "Invoice Total (excluding GST)",
      "GST charged at 6%",
      "GST charged at 8%",
      "GST charged at 12%",
      "GST charged at 16%",
      "Your Taxable Activity Number",
      "Revenue / Capital",
    ];

    const rows = inputClaimRows.map((row, index) => [
      index + 1,
      row.supplierTin,
      row.supplierName,
      row.invoiceNumber,
      row.invoiceDate,
      centsToMvr(row.invoiceTotalExcludingGstCents).toFixed(2),
      centsToMvr(row.gst6Cents).toFixed(2),
      centsToMvr(row.gst8Cents).toFixed(2),
      centsToMvr(row.gst12Cents).toFixed(2),
      centsToMvr(row.gst16Cents).toFixed(2),
      row.taxableActivityNumber,
      row.revenueCapital,
    ]);

    const csv = [headers, ...rows]
      .map((line) =>
        line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `mira-input-tax-statement-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }

  function exportAllData() {
    const data = {
      exportedAt: new Date().toISOString(),
      profile,
      history,
      inputClaimRows,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `maldives-tax-filer-data-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

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
          {notice && (
  <div className={`alert ${notice.type === "success" ? "success" : ""}`}>
    {typeof notice === "string" ? notice : notice.message}
  </div>
)}

          {activeTab === "dashboard" && (
            <section className="grid two">
              <div className="card">
                <h2>Dashboard</h2>
                <p className="small">
                  A focused workspace for GST, income tax, EWT, and MIRA input
                  claim preparation.
                </p>

                <div className="grid three" style={{ marginTop: 20 }}>
                  <StatCard label="History" value={history.length} />
                  <StatCard
                    label="Total Calculated"
                    value={`MVR ${formatMvr(totals.total)}`}
                  />
                  <StatCard
                    label="Input Claim Rows"
                    value={inputClaimRows.length}
                  />
                </div>
              </div>

              <div className="card">
                <h3>Rates currently set</h3>
                <div className="row">
                  <span>GST general</span>
                  <strong>8%</strong>
                </div>
                <div className="row">
                  <span>TGST tourism</span>
                  <strong>17%</strong>
                </div>
                <div className="row">
                  <span>Income tax</span>
                  <strong>0–15%</strong>
                </div>
                <div className="row">
                  <span>EWT monthly</span>
                  <strong>0–15%</strong>
                </div>
                <p className="small">
                  Verify rates against official MIRA guidance before production
                  filing.
                </p>
              </div>
            </section>
          )}

          {activeTab === "gst" && (
            <section className="grid two">
              <div className="card form">
                <h2>GST Calculator</h2>
                <SelectField
                  label="GST Sector"
                  value={gst.sector}
                  onChange={(v) => setGst({ ...gst, sector: v })}
                >
                  <option value="general">General sector - 8%</option>
                  <option value="tourism">Tourism sector - 17%</option>
                </SelectField>

                <Field
                  label="Total Sales (MVR)"
                  value={gst.totalSales}
                  onChange={(v) => setGst({ ...gst, totalSales: v })}
                  placeholder="150000.00"
                />

                <Field
                  label="Exempt Sales (MVR)"
                  value={gst.exemptSales}
                  onChange={(v) => setGst({ ...gst, exemptSales: v })}
                  placeholder="0.00"
                />

                <Field
                  label="Input Tax Claimed (MVR)"
                  value={gst.inputTax}
                  onChange={(v) => setGst({ ...gst, inputTax: v })}
                  placeholder="5000.00"
                />

                <label>
                  <input
                    type="checkbox"
                    checked={gst.nilReturn}
                    onChange={(e) =>
                      setGst({ ...gst, nilReturn: e.target.checked })
                    }
                  />{" "}
                  Nil return
                </label>

                <button className="btn" onClick={calculateGST}>
                  Calculate GST
                </button>
              </div>

              <div>
                {gstResult ? (
                  <ResultCard {...gstResult} />
                ) : (
                  <div className="alert">Enter GST values and calculate.</div>
                )}
              </div>
            </section>
          )}

          {activeTab === "income" && (
            <section className="grid two">
              <div className="card form">
                <h2>Income Tax Calculator</h2>
                <SelectField
                  label="Income Type"
                  value={income.type}
                  onChange={(v) => setIncome({ ...income, type: v })}
                >
                  <option value="individual">Individual Employment</option>
                  <option value="business">Business Owner</option>
                  <option value="rental">Rental Income</option>
                </SelectField>

                <Field
                  label="Annual Income (MVR)"
                  value={income.amount}
                  onChange={(v) => setIncome({ ...income, amount: v })}
                  placeholder="1500000.00"
                />

                {income.type === "business" && (
                  <Field
                    label="Business Expenses (MVR)"
                    value={income.businessExpenses}
                    onChange={(v) =>
                      setIncome({ ...income, businessExpenses: v })
                    }
                    placeholder="200000.00"
                  />
                )}

                <Field
                  label="Deductions (MVR)"
                  value={income.deductions}
                  onChange={(v) => setIncome({ ...income, deductions: v })}
                  placeholder="50000.00"
                />

                <SelectField
                  label="Resident Status"
                  value={income.residentStatus}
                  onChange={(v) =>
                    setIncome({ ...income, residentStatus: v })
                  }
                >
                  <option value="resident">Resident</option>
                  <option value="non-resident">Non-Resident</option>
                </SelectField>

                <button className="btn" onClick={calculateIncomeTax}>
                  Calculate Income Tax
                </button>
              </div>

              <div>
                {incomeResult ? (
                  <ResultCard {...incomeResult} />
                ) : (
                  <div className="alert">Enter income values and calculate.</div>
                )}
              </div>
            </section>
          )}

          {activeTab === "ewt" && (
            <section className="grid two">
              <div className="card form">
                <h2>Employee Withholding Tax</h2>

                <Field
                  label="Employee Name"
                  value={ewt.employeeName}
                  onChange={(v) => setEwt({ ...ewt, employeeName: v })}
                  placeholder="Ahmed Hassan"
                />

                <Field
                  label="Monthly Gross Salary (MVR)"
                  value={ewt.salary}
                  onChange={(v) => setEwt({ ...ewt, salary: v })}
                  placeholder="35000.00"
                />

                <Field
                  label="Allowances (MVR)"
                  value={ewt.allowances}
                  onChange={(v) => setEwt({ ...ewt, allowances: v })}
                  placeholder="5000.00"
                />

                <Field
                  label="Benefits (MVR)"
                  value={ewt.benefits}
                  onChange={(v) => setEwt({ ...ewt, benefits: v })}
                  placeholder="2000.00"
                />

                <Field
                  label="Employee Contribution (MVR)"
                  value={ewt.contribution}
                  onChange={(v) => setEwt({ ...ewt, contribution: v })}
                  placeholder="2000.00"
                />

                <button className="btn" onClick={calculateEWT}>
                  Calculate EWT
                </button>
              </div>

              <div>
                {ewtResult ? (
                  <ResultCard {...ewtResult} />
                ) : (
                  <div className="alert">Enter EWT values and calculate.</div>
                )}
              </div>
            </section>
          )}

          {activeTab === "inputClaims" && (
            <section className="grid" style={{ gap: 20 }}>
              <div className="card">
                <h2>MIRA Input Tax Claim Builder</h2>
                <p className="small">
                  Upload a bill, scan it with AI, verify fields, then export
                  CSV.
                </p>

                <div className="alert warn">
                  The OCR result must be reviewed before filing. Bills vary in
                  layout and OCR can make mistakes.
                </div>

                <div className="grid two">
                  <div>
                    <label className="drop">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: "none" }}
                        onChange={(e) =>
                          handleBillImageUpload(e.target.files?.[0])
                        }
                      />
                      <div style={{ fontSize: 34 }}>Upload</div>
                      <strong>Scan or upload bill</strong>
                      <div className="small">
                        Use mobile camera or upload an invoice image.
                      </div>
                    </label>

                    <button
                      className="btn"
                      style={{ width: "100%", marginTop: 14 }}
                      onClick={scanBillWithAI}
                      disabled={!billFile || isScanningBill}
                    >
                      {isScanningBill ? (
                        <>
                          <Spinner />
                          Scanning bill...
                        </>
                      ) : (
                        "Scan bill with AI"
                      )}
                    </button>
                    {isScanningBill && (
                    <div className="small" style={{ marginTop: 8 }}>
                    Processing image with AI...
                    </div>
                    )}

                    {billPreviewUrl && (
                      <img
                        className="preview"
                        src={billPreviewUrl}
                        alt="Uploaded bill preview"
                      />
                    )}
                  </div>

                  <div className="form">
                    <Field
                      label="Supplier TIN"
                      value={inputClaimDraft.supplierTin}
                      onChange={(v) => updateInputClaimDraft("supplierTin", v)}
                      placeholder="Supplier TIN"
                    />

                    <Field
                      label="Supplier Name"
                      value={inputClaimDraft.supplierName}
                      onChange={(v) =>
                        updateInputClaimDraft("supplierName", v)
                      }
                      placeholder="Supplier name"
                    />

                    <Field
                      label="Supplier Invoice Number"
                      value={inputClaimDraft.invoiceNumber}
                      onChange={(v) =>
                        updateInputClaimDraft("invoiceNumber", v)
                      }
                      placeholder="Invoice number"
                    />

                    <Field
                      label="Invoice Date"
                      type="date"
                      value={inputClaimDraft.invoiceDate}
                      onChange={(v) => updateInputClaimDraft("invoiceDate", v)}
                    />

                    <Field
                      label="Invoice Total excluding GST (MVR)"
                      value={inputClaimDraft.invoiceTotalExcludingGst}
                      onChange={(v) =>
                        updateInputClaimDraft("invoiceTotalExcludingGst", v)
                      }
                      placeholder="1000.00"
                    />

                    <div className="grid two">
                      <Field
                        label="GST charged at 6%"
                        value={inputClaimDraft.gst6}
                        onChange={(v) => updateInputClaimDraft("gst6", v)}
                        placeholder="0.00"
                      />

                      <Field
                        label="GST charged at 8%"
                        value={inputClaimDraft.gst8}
                        onChange={(v) => updateInputClaimDraft("gst8", v)}
                        placeholder="80.00"
                      />

                      <Field
                        label="GST charged at 12%"
                        value={inputClaimDraft.gst12}
                        onChange={(v) => updateInputClaimDraft("gst12", v)}
                        placeholder="0.00"
                      />

                      <Field
                        label="GST charged at 16%"
                        value={inputClaimDraft.gst16}
                        onChange={(v) => updateInputClaimDraft("gst16", v)}
                        placeholder="0.00"
                      />
                    </div>

                    <Field
                      label="Your Taxable Activity Number"
                      value={inputClaimDraft.taxableActivityNumber}
                      onChange={(v) =>
                        updateInputClaimDraft("taxableActivityNumber", v)
                      }
                      placeholder="Activity number"
                    />

                    <SelectField
                      label="Revenue / Capital"
                      value={inputClaimDraft.revenueCapital}
                      onChange={(v) =>
                        updateInputClaimDraft("revenueCapital", v)
                      }
                    >
                      <option value="Revenue">Revenue</option>
                      <option value="Capital">Capital</option>
                    </SelectField>

                    {inputClaimDraft.notes && (
                      <div className="alert">{inputClaimDraft.notes}</div>
                    )}

                    <button className="btn" onClick={addInputClaimRow}>
                      Add to Input Tax Statement
                    </button>
                  </div>
                </div>
              </div>

              <div className="card">
                <div
                  className="actions"
                  style={{ justifyContent: "space-between" }}
                >
                  <h3>Input Tax Statement Rows</h3>
                  <div className="actions">
                    <button
                      className="btn secondary"
                      onClick={exportInputClaimCsv}
                      disabled={inputClaimRows.length === 0}
                    >
                      Export CSV
                    </button>

                    <button
                      className="btn danger"
                      onClick={() => setInputClaimRows([])}
                      disabled={inputClaimRows.length === 0}
                    >
                      Clear Rows
                    </button>
                  </div>
                </div>

                {inputClaimRows.length === 0 ? (
                  <div className="alert">No input claim rows yet.</div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Supplier TIN</th>
                          <th>Supplier Name</th>
                          <th>Invoice No.</th>
                          <th>Date</th>
                          <th>Invoice Total excl. GST</th>
                          <th>GST 6%</th>
                          <th>GST 8%</th>
                          <th>GST 12%</th>
                          <th>GST 16%</th>
                          <th>Activity No.</th>
                          <th>Revenue / Capital</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inputClaimRows.map((row, index) => (
                          <tr key={row.id}>
                            <td>{index + 1}</td>
                            <td>{row.supplierTin}</td>
                            <td>{row.supplierName}</td>
                            <td>{row.invoiceNumber}</td>
                            <td>{row.invoiceDate}</td>
                            <td className="money">
                              {formatMvr(row.invoiceTotalExcludingGstCents)}
                            </td>
                            <td className="money">{formatMvr(row.gst6Cents)}</td>
                            <td className="money">{formatMvr(row.gst8Cents)}</td>
                            <td className="money">
                              {formatMvr(row.gst12Cents)}
                            </td>
                            <td className="money">
                              {formatMvr(row.gst16Cents)}
                            </td>
                            <td>{row.taxableActivityNumber}</td>
                            <td>{row.revenueCapital}</td>
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
              <div
                className="actions"
                style={{ justifyContent: "space-between" }}
              >
                <h2>Calculation History</h2>
                <div className="actions">
                  <button className="btn secondary" onClick={exportAllData}>
                    Export All Data
                  </button>
                  <button
                    className="btn danger"
                    onClick={() => setHistory([])}
                  >
                    Clear History
                  </button>
                </div>
              </div>

              {history.length === 0 ? (
                <div className="alert">No calculations saved yet.</div>
              ) : (
                history.map((item) => (
                  <div className="row" key={item.id}>
                    <span>
                      <strong>{item.type}</strong> — {item.title}
                      <br />
                      <small>{new Date(item.createdAt).toLocaleString()}</small>
                    </span>
                    <span className="money">MVR {formatMvr(item.amountCents)}</span>
                  </div>
                ))
              )}
            </section>
          )}

          {activeTab === "profile" && (
            <section className="grid two">
              <div className="card form">
                <h2>Profile</h2>

                <Field
                  label="Full Name"
                  value={profile.name}
                  onChange={(v) => setProfile({ ...profile, name: v })}
                  placeholder="Enter your name"
                />

                <Field
                  label="Email"
                  value={profile.email}
                  onChange={(v) => setProfile({ ...profile, email: v })}
                  placeholder="your.email@example.com"
                />

                <Field
                  label="TIN"
                  value={profile.tin}
                  onChange={(v) => setProfile({ ...profile, tin: v })}
                  placeholder="123456789"
                />

                <Field
                  label="Phone"
                  value={profile.phone}
                  onChange={(v) => setProfile({ ...profile, phone: v })}
                  placeholder="+960 7777777"
                />

                <Field
                  label="Business Name"
                  value={profile.business}
                  onChange={(v) => setProfile({ ...profile, business: v })}
                  placeholder="Your Business"
                />

                <SelectField
                  label="GST Registered?"
                  value={profile.gstStatus}
                  onChange={(v) => setProfile({ ...profile, gstStatus: v })}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </SelectField>

                <button className="btn" onClick={handleSaveProfile}>
                  Save Profile
                </button>
              </div>

              <div className="card">
                <h3>Secure AI extraction</h3>
                <p className="small">
                  The backend route{" "}
                  <strong>app/api/extract-input-claim/route.js</strong> calls
                  Gemini securely from the server using your{" "}
                  <strong>GEMINI_API_KEY</strong>.
                </p>
                <div className="alert warn">
                  Never put your Gemini API key in frontend React code.
                </div>
              </div>
            </section>
          )}
        </main>
      </section>
    </div>
  );
}

