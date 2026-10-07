Act as a Principal Software Engineer and Product Strategist.

Read all Markdown files inside the `docs/components/` directory.

Generate a compiled master architectural file at `docs/COMPONENTS.md` that synthesizes the entire codebase layout and acts as a context source for future AI feature generation.

Include the following sections:

# System Component Registry & Architecture Map

## 🗺️ High-Level System Topology

- A brief flow map showing how components interact across layers (e.g., Frontend Component -> API Service -> Backend Module -> Database/Storage).

## 📚 Component Catalog

Create a summary table listing every component:

| Component Name | Layer/Location | Core Responsibility | Key Dependencies | Primary Extension Point |
| -------------- | -------------- | ------------------- | ---------------- | ----------------------- |

## 🎯 Cross-Component Feature Opportunities

Analyze the collective component docs and identify 5 high-value, cross-cutting feature ideas for our community project:

1. Feature ideas that combine 2 or more existing components.
2. Low-hanging fruit features (high impact, low architectural friction).
3. Missing system components that should be built next.

CRITICAL INSTRUCTION: If any individual component doc seems incomplete, ambiguous, or lacks clear extension points, list those component names under an "Unclear Components / Need Re-Audit" heading at the bottom and ask me if you should re-inspect them.
