"use client";

import React from "react";

type DensityMode = "comfortable" | "compact";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  statusBadge?: React.ReactNode;
  timestamps?: React.ReactNode;
  actions?: React.ReactNode;
  overflow?: React.ReactNode;
}

// Page-level header that keeps the title/meta anchored to the primary actions.
export function PageHeader({
  title,
  subtitle,
  statusBadge,
  timestamps,
  actions,
  overflow,
}: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header-main">
        <div className="page-header-title-row">
          <h1>{title}</h1>
          {statusBadge}
        </div>
        {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
        {timestamps && <div className="page-header-meta">{timestamps}</div>}
      </div>
      <div className="page-header-actions">
        {actions}
        {overflow}
      </div>
    </div>
  );
}

// Sticky rail container for run health and next-step guidance.
export function StickySummaryRail({ children }: { children: React.ReactNode }) {
  return <aside className="sticky-summary-rail">{children}</aside>;
}

interface SectionCardProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

// Card wrapper with optional collapse for progressive disclosure.
export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  collapsible = false,
  defaultOpen = true,
}: SectionCardProps) {
  if (!collapsible) {
    return (
      <section className="section-card">
        <header className="section-card-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p className="section-card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="section-card-actions">{actions}</div>}
        </header>
        <div className="section-card-body">{children}</div>
      </section>
    );
  }

  return (
    <details className="section-card collapsible" open={defaultOpen}>
      <summary className="section-card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="section-card-subtitle">{subtitle}</p>}
        </div>
        {actions && (
          <div
            className="section-card-actions"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        )}
        <span className="section-card-toggle" aria-hidden="true" />
      </summary>
      <div className="section-card-body">{children}</div>
    </details>
  );
}

interface DensityToggleProps {
  value: DensityMode;
  onChange: (value: DensityMode) => void;
  label?: string;
}

// Segmented control to switch between comfortable and compact density modes.
export function DensityToggle({ value, onChange, label }: DensityToggleProps) {
  return (
    <div className="density-toggle" role="group" aria-label={label || "Density"}>
      <button
        type="button"
        className={`density-option ${value === "comfortable" ? "active" : ""}`}
        onClick={() => onChange("comfortable")}
        aria-pressed={value === "comfortable"}
      >
        Comfortable
      </button>
      <button
        type="button"
        className={`density-option ${value === "compact" ? "active" : ""}`}
        onClick={() => onChange("compact")}
        aria-pressed={value === "compact"}
      >
        Compact
      </button>
    </div>
  );
}

interface DiffExplorerToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  sectionFilter: string;
  onSectionFilterChange: (value: string) => void;
  companyFilter: string;
  onCompanyFilterChange: (value: string) => void;
  onlyModified: boolean;
  onOnlyModifiedChange: (value: boolean) => void;
  showDifferences: boolean;
  onShowDifferencesChange: (value: boolean) => void;
  density: DensityMode;
  onDensityChange: (value: DensityMode) => void;
  sectionOptions: string[];
  companyOptions: string[];
}

// Toolbar for filtering and scanning bullet changes.
export function DiffExplorerToolbar({
  searchValue,
  onSearchChange,
  sectionFilter,
  onSectionFilterChange,
  companyFilter,
  onCompanyFilterChange,
  onlyModified,
  onOnlyModifiedChange,
  showDifferences,
  onShowDifferencesChange,
  density,
  onDensityChange,
  sectionOptions,
  companyOptions,
}: DiffExplorerToolbarProps) {
  return (
    <div className="diff-toolbar">
      <div className="diff-toolbar-search">
        <span className="diff-toolbar-icon" aria-hidden="true">
          🔎
        </span>
        <input
          className="input"
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search bullets, skills, metrics..."
          aria-label="Search bullet changes"
        />
      </div>
      <div className="diff-toolbar-filters">
        <select
          className="select"
          value={sectionFilter}
          onChange={(event) => onSectionFilterChange(event.target.value)}
          aria-label="Filter by section"
        >
          {sectionOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={companyFilter}
          onChange={(event) => onCompanyFilterChange(event.target.value)}
          aria-label="Filter by company"
        >
          {companyOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={onlyModified}
            onChange={(event) => onOnlyModifiedChange(event.target.checked)}
          />
          <span>Only modified</span>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showDifferences}
            onChange={(event) => onShowDifferencesChange(event.target.checked)}
          />
          <span>Show differences</span>
        </label>
        <DensityToggle value={density} onChange={onDensityChange} label="Density" />
      </div>
    </div>
  );
}

interface DiffCardProps {
  summary: string;
  chips: string[];
  impact: string;
  wasRewritten: boolean;
  original: React.ReactNode;
  tailored: React.ReactNode;
  defaultOpen?: boolean;
  onEdit?: () => void;
  onRevert?: () => void;
  onAccept?: () => void;
}

// Expandable card for a single bullet diff.
export function DiffCard({
  summary,
  chips,
  impact,
  wasRewritten,
  original,
  tailored,
  defaultOpen = false,
  onEdit,
  onRevert,
  onAccept,
}: DiffCardProps) {
  return (
    <details className={`diff-card ${wasRewritten ? "modified" : "unchanged"}`} open={defaultOpen}>
      <summary className="diff-card-summary">
        <div className="diff-card-summary-text">
          <span>{summary}</span>
          <div className="diff-card-chips">
            {chips.map((chip) => (
              <span key={chip} className="diff-chip">
                {chip}
              </span>
            ))}
          </div>
        </div>
        <div className="diff-card-meta">
          <span className={`impact-tag ${impact.toLowerCase()}`}>{impact} impact</span>
          <span className={`change-pill ${wasRewritten ? "modified" : "unchanged"}`}>
            {wasRewritten ? "Modified" : "Unchanged"}
          </span>
        </div>
        <span className="diff-card-toggle" aria-hidden="true" />
      </summary>
      <div className="diff-card-body">
        <div className="diff-card-actions">
          <button type="button" className="ghost small" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="ghost small" onClick={onRevert}>
            Revert
          </button>
          <button type="button" className="primary small" onClick={onAccept}>
            Accept
          </button>
        </div>
        <div className="diff-card-grid">
          <div className="diff-card-panel">
            <label>Original</label>
            <div className="diff-card-text">{original}</div>
          </div>
          <div className="diff-card-panel">
            <label>Tailored</label>
            <div className="diff-card-text">{tailored}</div>
          </div>
        </div>
      </div>
    </details>
  );
}

interface AdvancedAccordionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

// Collapsible container for advanced or diagnostic content.
export function AdvancedAccordion({ title, children, defaultOpen = false }: AdvancedAccordionProps) {
  return (
    <details className="advanced-accordion" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        <span className="accordion-toggle" aria-hidden="true" />
      </summary>
      <div className="advanced-accordion-body">{children}</div>
    </details>
  );
}
