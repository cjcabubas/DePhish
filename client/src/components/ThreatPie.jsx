import React, { useState } from "react";

const types = [
  { kind: "url", label: "URL", color: "#087f75" },
  { kind: "domain", label: "Domain", color: "#4679bf" },
  { kind: "email", label: "Sender email", color: "#9863b5" },
  { kind: "phone", label: "Phone number", color: "#ba7719" },
];

export function ThreatPie({ distribution, selected, onSelect }) {
  const [hovered, setHovered] = useState(null);
  const rows = types.map((type) => ({
    ...type,
    count: distribution.find((row) => row.kind === type.kind)?.count || 0,
  }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const active = rows.find((row) => row.kind === (hovered || selected));
  let angle = -Math.PI / 2;
  const toggle = (kind) => onSelect(selected === kind ? "" : kind);
  return (
    <section className="panel threatChartPanel">
      <div className="panelHead">
        <h2>Indicators by type</h2>
        <span>{total.toLocaleString()} unique indicators</span>
      </div>
      <p className="dashboardNote">
        Search and verification period apply to this chart. Select a slice or
        legend to filter the table by type.
      </p>
      {total ? (
        <div className="threatChartLayout">
          <svg
            className="threatPie"
            viewBox="0 0 240 240"
            role="group"
            aria-label="Verified indicator distribution by type"
          >
            {rows
              .filter((row) => row.count)
              .map((row) => {
                const start = angle;
                angle += (row.count / total) * Math.PI * 2;
                const path =
                  row.count === total
                    ? "M 120 12 A 108 108 0 1 1 120 228 A 108 108 0 1 1 120 12 Z"
                    : `M 120 120 L ${120 + 108 * Math.cos(start)} ${120 + 108 * Math.sin(start)} A 108 108 0 ${row.count / total > 0.5 ? 1 : 0} 1 ${120 + 108 * Math.cos(angle)} ${120 + 108 * Math.sin(angle)} Z`;
                const description = `${row.label}: ${row.count} indicators (${((row.count / total) * 100).toFixed(1)}%)`;
                return (
                  <path
                    key={row.kind}
                    d={path}
                    fill={row.color}
                    stroke="white"
                    strokeWidth="3"
                    role="button"
                    tabIndex={0}
                    aria-label={description}
                    aria-pressed={selected === row.kind}
                    className={
                      selected && selected !== row.kind ? "mutedSlice" : ""
                    }
                    onMouseEnter={() => setHovered(row.kind)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(row.kind)}
                    onBlur={() => setHovered(null)}
                    onClick={() => toggle(row.kind)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggle(row.kind);
                      }
                    }}
                  >
                    <title>{description}</title>
                  </path>
                );
              })}
          </svg>
          <div className="threatLegend">
            {rows.map((row) => (
              <button
                type="button"
                key={row.kind}
                aria-pressed={selected === row.kind}
                onClick={() => toggle(row.kind)}
              >
                <span
                  className="threatSwatch"
                  style={{ background: row.color }}
                />
                <span>{row.label}</span>
                <b>{row.count.toLocaleString()}</b>
                <small>{((row.count / total) * 100).toFixed(1)}%</small>
              </button>
            ))}
            <p className="threatChartDetail" aria-live="polite">
              {active
                ? `${active.label} · ${active.count.toLocaleString()} indicators · ${((active.count / total) * 100).toFixed(1)}%`
                : "Hover or focus a slice to explore the data."}
            </p>
          </div>
        </div>
      ) : (
        <p className="dashboardEmpty">
          No indicators match this search and verification period.
        </p>
      )}
    </section>
  );
}
