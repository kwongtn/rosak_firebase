Act as a Lead Systems Architect. Analyze the single component / feature given.

Examine all associated files (e.g., TS/HTML/CSS, Python models/views, or edge functions) and generate a clean, isolated Markdown documentation file saved to `docs/components/{COMPONENT_NAME}.md`.

Strictly follow this standard structure:

# Component: {COMPONENT_NAME}

## 📌 Purpose & Scope

- **Core Responsibility:** What single problem does this component solve?
- **Domain/Layer:** (e.g., Angular Presentation, Django Business Logic, Supabase Edge Function)

## 🔌 Interface & Data Flow

- **Inputs / Props / Signals:** List parameters, data types, and default values.
- **Outputs / Events / API Responses:** List emitted events, RxJS streams, or return payloads.
- **Dependencies:** Key services, state stores, or third-party packages relied upon.

## ⚙️ Internal State & Logic

- Brief outline of internal state management (e.g., Angular Signals, RxJS BehaviorSubject, Local DB queries).

## 🧩 Extension Points & Hooks

- Existing extension patterns (e.g., slot projections, custom decorators, interceptors).
- Places where new functionality can be attached without breaking changes.

## 💡 Potential AI Feature Opportunities

- Identify 2–3 logical features, capabilities, or UX improvements that this component is structurally ready to support in future iterations.

Do NOT include long raw code dumps. Focus on concise, high-signal technical abstractions.
