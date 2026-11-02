# Force restoration contract

The user approved preferring newer operations over identified old automatic snapshots. Explicit restoration of old versions is not implemented by this change.

Both generated and standalone force controls validate component identity, complete display-state types and ordering metadata before initial or active restoration. A valid initial snapshot seeds the ordering guard. Each mount remembers the greatest accepted revision for up to 32 foreign producer sessions. A strictly greater revision from a known producer remains restorable; lower or equal revisions are ignored, including conflicting equal payloads and repeated echoes after local edits. Own-mount echoes remain ignored. Invalid payloads cannot advance the guard, and restoration never publishes another state.

The 32-source map does not evict known producers: once full, additional unknown ordered sources are ignored for this mount. Known producers with greater revisions, local controls and legacy recovery continue working. A new mount begins a new map, seeded only by its valid initial snapshot. This is bounded per-mount knowledge, not persistent or global ordering.

Different producer session counters are incomparable. There is no trusted host global revision or explicit restore-intent signal. Valid unseen producers (within capacity) and legacy snapshots without ordering metadata remain compatible and may overwrite display preferences; their relative age cannot be established. Local edits are protected from recognized old/equal snapshots and own echoes, not from every unknown concurrent writer. Configured physical inputs and force calculations are unaffected.

Regression coverage includes initial/remount recovery, malformed initial order, invalid identity/state/order, repeated/older/newer foreign snapshots, local edits, same-mount echoes, independent source counters, legacy recovery without erasing high-water marks, and 32/33-source capacity. The original known-risk characterization and failing regression output remain outside the distributable source as private development evidence.

Resource provenance: frozen v4 diagnostic HTML bytes retain their fixed hashes. Updated diagnostic resources use explicit v5 names and URIs. Force-template indentation uses tabs within the renderer to retain the existing strict 40,000-byte budget without deleting validation or changing that limit. Generated files remain derived from the canonical kit.
