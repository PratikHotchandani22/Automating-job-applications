/**
 * Browser console utility for validating runs data
 * Usage: Import this in the browser console or add to a page component
 */

import { runValidationTests, printValidationResults, validateRunsData, printRunsValidation } from "./validateCleaning";
import { useDashboardStore } from "../store/dashboardStore";

/**
 * Run validation tests and print results
 * Call this from browser console: window.validateCleaning()
 */
export const validateCleaning = () => {
  const results = runValidationTests();
  printValidationResults(results);
  return results;
};

/**
 * Validate current runs data from the store
 * Call this from browser console: window.validateRuns()
 * You can also pass runs directly: window.validateRuns(myRunsArray)
 */
export const validateRuns = (runsOverride?: any[]) => {
  let runs: any[];
  
  if (runsOverride && Array.isArray(runsOverride)) {
    runs = runsOverride;
  } else {
    try {
      runs = useDashboardStore.getState().runs;
    } catch (error) {
      console.error("Could not access runs from store. Make sure you're calling this from the dashboard page.");
      console.error("You can also pass runs directly: window.validateRuns(myRunsArray)");
      return null;
    }
  }
  
  const stats = validateRunsData(runs);
  printRunsValidation(stats);
  return stats;
};

/**
 * Setup window utilities for browser console access
 */
if (typeof window !== "undefined") {
  (window as any).validateCleaning = validateCleaning;
  (window as any).validateRuns = validateRuns;
}

