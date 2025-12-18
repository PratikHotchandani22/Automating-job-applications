/**
 * Validation utility for title and company cleaning functions
 * Tests the cleaning logic with various edge cases to ensure data quality
 */

import type { RunRecord } from "../types";

// Helper function to clean up job titles and company names (matches Overview.tsx)
export const cleanJobTitle = (title: string | undefined | null): string => {
  if (!title) return "Untitled role";
  const cleaned = title.trim();
  // Remove browser notification patterns
  if (/^\d+\s+notifications?/i.test(cleaned) || /extensions?\s*-\s*job\s+page/i.test(cleaned)) {
    return "Untitled role";
  }
  return cleaned || "Untitled role";
};

export const cleanCompanyName = (company: string | undefined | null): string | null => {
  if (!company) return null;
  const cleaned = company.trim();
  // Filter out invalid company names
  if (!cleaned || cleaned.toLowerCase().includes("unknown") || cleaned.length < 2) {
    return null;
  }
  // Remove URL patterns that might have been mistaken for company names
  if (/^https?:\/\//i.test(cleaned) || /^www\./i.test(cleaned)) {
    return null;
  }
  return cleaned;
};

// Test cases for validation
export const testCases = {
  titles: [
    { input: "0 notifications", expected: "Untitled role", description: "Browser notification pattern" },
    { input: "5 notifications", expected: "Untitled role", description: "Multiple notifications" },
    { input: "Extensions - Job Page", expected: "Untitled role", description: "Extension page title" },
    { input: "extensions - job page", expected: "Untitled role", description: "Extension page title (lowercase)" },
    { input: "Senior Software Engineer", expected: "Senior Software Engineer", description: "Valid title" },
    { input: "  Data Scientist  ", expected: "Data Scientist", description: "Title with whitespace" },
    { input: "", expected: "Untitled role", description: "Empty title" },
    { input: null, expected: "Untitled role", description: "Null title" },
    { input: undefined, expected: "Untitled role", description: "Undefined title" },
    { input: "Lead ML Engineer at Google", expected: "Lead ML Engineer at Google", description: "Title with company" }
  ],
  companies: [
    { input: "Unknown Company", expected: null, description: "Unknown company" },
    { input: "unknown", expected: null, description: "Lowercase unknown" },
    { input: "UNKNOWN", expected: null, description: "Uppercase unknown" },
    { input: "https://www.linkedin.com", expected: null, description: "Full URL" },
    { input: "www.linkedin.com", expected: null, description: "URL without protocol" },
    { input: "Www.linkedin.com", expected: null, description: "URL with capital W" },
    { input: "http://example.com", expected: null, description: "HTTP URL" },
    { input: "Google", expected: "Google", description: "Valid company" },
    { input: "  Microsoft  ", expected: "Microsoft", description: "Company with whitespace" },
    { input: "", expected: null, description: "Empty company" },
    { input: null, expected: null, description: "Null company" },
    { input: undefined, expected: null, description: "Undefined company" },
    { input: "A", expected: null, description: "Single character (too short)" },
    { input: "NVIDIA", expected: "NVIDIA", description: "Valid short company" },
    { input: "Amazon Web Services", expected: "Amazon Web Services", description: "Multi-word company" }
  ]
};

/**
 * Run validation tests and return results
 */
export const runValidationTests = () => {
  const results = {
    titleTests: [] as Array<{ input: any; expected: string; actual: string; passed: boolean; description: string }>,
    companyTests: [] as Array<{ input: any; expected: string | null; actual: string | null; passed: boolean; description: string }>
  };

  // Test title cleaning
  testCases.titles.forEach((testCase) => {
    const actual = cleanJobTitle(testCase.input);
    const passed = actual === testCase.expected;
    results.titleTests.push({
      input: testCase.input,
      expected: testCase.expected,
      actual,
      passed,
      description: testCase.description
    });
  });

  // Test company cleaning
  testCases.companies.forEach((testCase) => {
    const actual = cleanCompanyName(testCase.input);
    const passed = actual === testCase.expected;
    results.companyTests.push({
      input: testCase.input,
      expected: testCase.expected,
      actual,
      passed,
      description: testCase.description
    });
  });

  return results;
};

/**
 * Validate runs data and return cleaning statistics
 */
export const validateRunsData = (runs: RunRecord[]) => {
  const stats = {
    totalRuns: runs.length,
    cleanedTitles: 0,
    cleanedCompanies: 0,
    problematicTitles: [] as Array<{ runId: string; original: string; cleaned: string }>,
    problematicCompanies: [] as Array<{ runId: string; original: string; cleaned: string | null }>,
    beforeAfter: [] as Array<{
      runId: string;
      titleBefore: string;
      titleAfter: string;
      companyBefore: string;
      companyAfter: string | null;
    }>
  };

  runs.forEach((run) => {
    const originalTitle = run.title || "";
    const originalCompany = run.company || "";
    const cleanedTitle = cleanJobTitle(run.title);
    const cleanedCompany = cleanCompanyName(run.company);

    if (cleanedTitle !== originalTitle) {
      stats.cleanedTitles++;
      stats.problematicTitles.push({
        runId: run.runId,
        original: originalTitle,
        cleaned: cleanedTitle
      });
    }

    if (cleanedCompany !== originalCompany) {
      stats.cleanedCompanies++;
      stats.problematicCompanies.push({
        runId: run.runId,
        original: originalCompany,
        cleaned: cleanedCompany
      });
    }

    stats.beforeAfter.push({
      runId: run.runId,
      titleBefore: originalTitle,
      titleAfter: cleanedTitle,
      companyBefore: originalCompany,
      companyAfter: cleanedCompany
    });
  });

  return stats;
};

/**
 * Print validation results in a readable format
 */
export const printValidationResults = (results: ReturnType<typeof runValidationTests>) => {
  console.log("=== Title Cleaning Validation ===");
  results.titleTests.forEach((test) => {
    const status = test.passed ? "✅" : "❌";
    console.log(`${status} ${test.description}`);
    if (!test.passed) {
      console.log(`   Input: "${test.input}"`);
      console.log(`   Expected: "${test.expected}"`);
      console.log(`   Actual: "${test.actual}"`);
    }
  });

  console.log("\n=== Company Cleaning Validation ===");
  results.companyTests.forEach((test) => {
    const status = test.passed ? "✅" : "❌";
    console.log(`${status} ${test.description}`);
    if (!test.passed) {
      console.log(`   Input: "${test.input}"`);
      console.log(`   Expected: ${test.expected === null ? "null" : `"${test.expected}"`}`);
      console.log(`   Actual: ${test.actual === null ? "null" : `"${test.actual}"`}`);
    }
  });

  const titlePassed = results.titleTests.filter((t) => t.passed).length;
  const companyPassed = results.companyTests.filter((t) => t.passed).length;
  const totalTests = results.titleTests.length + results.companyTests.length;
  const totalPassed = titlePassed + companyPassed;

  console.log("\n=== Summary ===");
  console.log(`Title Tests: ${titlePassed}/${results.titleTests.length} passed`);
  console.log(`Company Tests: ${companyPassed}/${results.companyTests.length} passed`);
  console.log(`Total: ${totalPassed}/${totalTests} passed`);
};

/**
 * Print runs data validation statistics
 */
export const printRunsValidation = (stats: ReturnType<typeof validateRunsData>) => {
  console.log("=== Runs Data Validation ===");
  console.log(`Total Runs: ${stats.totalRuns}`);
  console.log(`Titles Cleaned: ${stats.cleanedTitles}`);
  console.log(`Companies Cleaned: ${stats.cleanedCompanies}`);

  if (stats.problematicTitles.length > 0) {
    console.log("\n⚠️  Problematic Titles:");
    stats.problematicTitles.forEach((item) => {
      console.log(`  Run ${item.runId}: "${item.original}" -> "${item.cleaned}"`);
    });
  }

  if (stats.problematicCompanies.length > 0) {
    console.log("\n⚠️  Problematic Companies:");
    stats.problematicCompanies.forEach((item) => {
      console.log(`  Run ${item.runId}: "${item.original}" -> ${item.cleaned === null ? "null" : `"${item.cleaned}"`}`);
    });
  }

  if (stats.problematicTitles.length === 0 && stats.problematicCompanies.length === 0) {
    console.log("\n✅ All runs have clean titles and company names!");
  }
};

