---
inclusion: always
---

# Staff Portal Specification (Vape Shop)

Requirements for the **staff-facing** portal, gathered from the product owner.
The provided mockups are for **layout and behavior only** — do NOT copy their
light visual style. This is a living spec; update it as more detail arrives.

## Global rules

- **Branding:** use the app's normal **"Vape Shop"** branding (NOT "Dailysmokz",
  which only appeared in the mockups).
- **UI / theme:** staff pages must match the **admin pages** — same dark theme,
  cards, buttons, badges, tables, and overall layout/components.
- **Shared backend & database:** staff actions use the **same** backend/DB as
  admin and flow into the admin side:
  - A **sale** a staff member submits → appears in the admin's **Pending Sales**.
  - A **disposal** a staff member requests → appears in the admin's **pending
    disposals**.
- **Branch scoping (critical):** each staff user can access **only the single
  branch** the admin assigned to their account. Every product, stock/quantity,
  sale, disposal, and report shown to staff is scoped to that one branch.

## Navigation (staff top bar)

- Links: **Home**, **Daily Reports**, **Products**.
- Logged-in staff name shown top-right.
- Floating **bag / briefcase icon** = the **draft** (see below).

## 1. Home page — Brands

- Heading **"Brands"** with a breadcrumb (shows the staff's branch).
- A **working search bar**.
- Grid of **brand cards**: each shows the brand **photo** + brand **name**
  (placeholder image when none).
- Clicking a brand opens that brand's products page.

## 2. Brand → Products view

- **Back** button + breadcrumb + brand name as heading (e.g. "RELX").
- Its own **working search bar**.
- Grid of **product cards** for that brand: product **image**, **name**,
  **price in PHP (₱)**, and **stock** (for the staff's branch).

## 3. Daily Reports page

- Breadcrumb (staff branch) + **"Daily Report"** heading.
- **"Disposals"** button (top-right) → opens a **"Pending Disposals"** modal
  listing pending disposals **for that shop** (empty: "No pending disposals for
  your shop.").
- **"View by"** dropdown: **View by Sale** and **View by Product**.
- A **working search bar**.
- Sales list (empty state: "No sales available.").
- Summary footer: **Total for Cash**, **Total for Gcash**, **Total for All
  Sales** (all in ₱).

## 4. Products page (view-only)

- Same as the **admin Products view**, BUT staff can **only view** — no add,
  edit, or delete. Branch-scoped.
- Heading **"Products"**.
- **"All Brands"** filter dropdown (All Brands + each brand).
- **"Show N entries"** selector (5, 10, 25, 50, 100, All).
- **"Search products..."** box.
- Table columns: **#**, **Image**, **Name**, **Quantity**, **Brand**,
  **Selling Price** (₱).
- **Pagination** ("Showing X to Y of Z products"; Previous / 1 / 2 / … / Next).

## 5. Draft (bag / briefcase icon)

- A draft order/cart for building a sale. Empty state: "No pending orders."
- Has options to **save** and to **decline / remove** an entry if the input was
  wrong.
- Submitting the draft creates a **sale** that lands in the admin's
  **Pending Sales** (branch-scoped).

## Open items (awaiting more detail)

- Exact finalize flow for the draft → sale (payment method, customer, etc.).
- Confirm the disposal request entry point in the staff UI.
