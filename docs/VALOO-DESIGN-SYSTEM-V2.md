# VALOO Design System V2

> Status: Canonical frontend visual and interaction baseline  
> Product: VALOO  
> Branch: `feature/core-commerce-foundation`

## 1. Purpose

VALOO uses one product-facing visual language across all modules. The canonical language is the blue/cyan VALOO system with a floating application shell, white/glass surfaces, restrained shadows and enterprise-oriented information density.

Module-specific themes must not redefine the product palette, control geometry, typography scale or interaction behavior.

## 2. Canonical Visual Language

### Brand

- Primary: `#1674BD`
- Deep Blue: `#0551B0`
- Cyan: `#55D4E1`
- Primary gradient: Cyan -> Primary -> Deep Blue
- Success: `#178A61`
- Warning: `#B66F24`
- Danger: `#C45167`

### Surfaces

- Page: `#F7FAFC`
- Surface: `#FFFFFF`
- Soft surface: `#F6F9FB`
- Border: `#DFE7ED`
- Strong border: `#C9D6E0`

### Text

- Primary: `#17212B`
- Secondary: `#667482`
- Muted text must retain readable contrast. Decorative low-contrast text must not be used for important data.

## 3. Application Shell

Desktop uses the floating sidebar as the canonical shell.

- expanded width: 260px
- collapsed width: 76px
- page inset: 16px
- shell radius: 28px
- sidebar remains visually detached from the viewport edge
- mobile continues to use the dedicated mobile navigation/context surfaces

Module layouts must not replace the floating shell with a different sidebar system.

## 4. Typography

Canonical minimum sizes:

| Role | Size |
|---|---:|
| Hero | 36px |
| Page title | 32px |
| Section title | 20px |
| Card title | 16px |
| Body / controls | 14px |
| Form label | 13px |
| Secondary text | 12px |
| Caption / badge minimum | 11px |

Important user-facing information must not use 8px, 9px or 10px text.

## 5. Spacing

Use the shared spacing rhythm:

`4, 8, 12, 16, 20, 24, 32, 40px`

Defaults:

- control internal gap: 8px
- field gap: 16-20px
- card padding: 20-24px
- section gap: 24-32px

## 6. Radius

Use only the canonical radius hierarchy unless a component has a documented exception.

- tiny: 8px
- controls: 12px
- compact cards: 16px
- cards: 20px
- dialogs: 24px
- floating application shell: 28px

## 7. Controls

### Button

The shared `Button` component is authoritative.

Variants:

- primary
- secondary
- ghost
- danger
- success
- link

Sizes:

- sm: 36px
- md: 42px
- lg: 48px
- icon: 42px

Primary actions use the VALOO cyan/blue gradient. Screens must not recreate primary button styling locally.

### Select / Combobox

Use `ValooSelect` for product-facing selection controls when the screen is migrated to V2.

Features:

- VALOO-specific trigger and option surface
- optional search
- keyboard navigation
- selected-state checkmark
- loading and empty states
- disabled options
- portal-based floating menu so dialogs do not clip options

Native `select` remains a compatibility primitive during migration only.

### MultiSelect

Use `ValooMultiSelect`.

Features:

- searchable options
- multiple selection
- selected chips
- selected-count overflow
- keyboard navigation
- optional selection limit

Do not introduce native `select multiple` for new product UI.

### Segmented Control

Use `ValooSegmentedControl` for small mutually-exclusive sets, normally 2-4 choices, such as payment method or compact view state.

## 8. Forms

Shared form primitives are authoritative:

- `Field`
- `FormSection`
- `FormGrid`
- `FormActions`
- `FormHint`
- `FormStepper`
- `FormSubmitButton`

A field can contain:

1. label
2. required indicator
3. control
4. hint or inline validation error

Long text/address/note fields normally span the full form width. Short structured fields may share rows.

Form stepper labels must stay at or above 12px and descriptions at or above 11px.

## 9. Cards

Three intended card levels:

1. standard card — white surface, 20px radius, light border/shadow
2. elevated card — glass/elevated surface, 22-24px visual treatment where needed
3. interactive card — standard card plus controlled hover/focus affordance

Module styles must not invent a separate purple, dark or unrelated card language.

## 10. Dialogs

The target architecture is one dialog primitive family:

- Modal
- Drawer
- Bottom Sheet
- Confirm Dialog
- Full-screen Dialog

All must inherit keyboard escape handling, focus containment/restoration, scroll locking and the canonical VALOO surface treatment.

Legacy duplicate modal/overlay implementations are migration debt.

## 11. Tables

The target shared table layer must support:

- search/filter toolbar
- sorting
- pagination
- row actions
- empty/loading state
- responsive mobile representation
- optional column visibility and bulk selection

New screens must not create a new unrelated table visual system.

## 12. Migration Rules

1. Business logic, RBAC, tenant isolation and API contracts must not change during visual migration.
2. Do not introduce module-specific palettes.
3. Do not add new raw hard-coded purple theme values.
4. Prefer shared controls over local `button`, `select` and repeated field implementations.
5. Existing native controls are migrated incrementally to VALOO controls.
6. New frontend work must use V2 primitives immediately.
7. Remove legacy compatibility CSS only after the dependent screens have migrated.

## 13. Migration Order

1. shared tokens and primitives
2. AppShell
3. Dashboard
4. CRM
5. Customers / Appointments / Services
6. Finance
7. HR
8. Inventory / Procurement
9. Operations / Reports / Training / Quality
10. Marketplace / Supplier / Platform surfaces
11. legacy style cleanup and final responsive/accessibility QA

## 14. Current Implementation Checkpoint

Implemented in the first V2 increment:

- canonical VALOO design tokens expanded
- shared Button variants and sizes normalized
- shared form typography/spacing raised to readable minimums
- `ValooSelect`
- `ValooMultiSelect`
- `ValooSegmentedControl`
- appointment editor migrated to VALOO selection controls
- dashboard quick appointment/payment flows migrated
- customer-source selection migrated
- inventory module purple focus/primary accents aligned to VALOO blue/cyan
- authenticated application consistency layer is loaded globally
- legacy 8-10px application text is normalized to the readable VALOO minimum
- shared `Select` and `ToolbarSelect` route through the custom VALOO dropdown adapter
- sidebar and mobile branch context selectors use `ValooSelect`
- HR dynamic forms, customer 360 selectors and role filters use VALOO controls
- inventory select helper routes all inventory form selections through `ValooSelect`
- application dialogs use the accessible VALOO modal foundation, including inventory form shells
- canonical dialog sizes: sm / md / lg / xl

Remaining legacy screens continue to be migrated incrementally.
