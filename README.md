# Sparezy MIS Dashboard 🚗💨

**Sparezy MIS Dashboard** is a highly optimized, production-ready Management Information System (MIS) designed explicitly for an automobile spare parts business handling high-tempo wholesale and retail workflows across multiple brands.

Built around a high-performance **React + TypeScript + Vite** stack on top of **Tailwind CSS**, it features full mock/local persistence out of the box and provides an elegant, copy-pasteable migration ledger for real **Supabase PostgreSQL** databases.

---

## ⚡ Core Business Architecture

Sparezy isolates operational brand data into **separate schemas** in order to avoid accidental overlaps, speed up queries, and enforce security:

1. **`public`**: Shared structures (Operators, Users lists, Customer directories, Activity logs).
2. **`hyundai`**: Isolated Hyundai stock tables, manual/AI invoices, returns, and CSV uploads.
3. **`mahindra`**: Isolated Mahindra stock tables, manual/AI invoices, returns, and CSV uploads.

---

## 🛠️ Tech Stack & Major Features

- **Isolated Brand Schemas**: On launching the portal, select **Hyundai** or **Mahindra**; only that brand's partitions are loaded to optimize page speeds.
- **Durable Persistence Engine (`src/dbStore.ts`)**: Fast, automated, simulated-Supabase client running over client storage with transactional logging.
- **Inventory module**: Pagination, search, stock levels, archiving and unarchiving.
- **Point of Sales (POS)**: Dynamic bill checks, dealer discount reductions, walk-in customer addition, and print-slip generator that automatically hides part numbers.
- **Product Returns Register**: Full or partial returns with automatic stock restoration, and refund adjustments.
- **AI Procurement Scanner**: Scans PDF/Image invoices, matches against active spares, displays "Matched" vs "New" parts, and flags if the dealer discount deviates from **12%**.
- **Undo Stack Log**: Reverts bulk stock or price adjustments with a single click.
- **Date-Filtered Customer Ledger & Dealer Records**: Downloads exact CSV balances that open natively in Microsoft Excel and Google Sheets.
- **Activity Audit Trail**: Expansion viewer showing detailed `old_data` vs `new_data` JSON diffs (Admin only).
- **Settings & User Credentials Block**: Creates Manager and Admin accounts and toggles login permissions.

---

## 📂 Supabase Database Setup

To migrate from mock storage to a production Supabase instance:

1. Open your **Supabase Settings** and look under **SQL Editor**.
2. Copy and paste the pre-designed schema definitions located in our project's `/supabase_schema.sql` file.
3. This will automatically execute:
   - Creation of `hyundai` and `mahindra` schemas.
   - Core tables (`inventory`, `sales`, `sale_items`, `returns`, `purchases`, `purchase_items`).
   - Standard indexing for parts indices (`part_no` and `hsn`).
   - Robust **Row Level Security (RLS)** constraints.
4. Set up client variables in your server configuration.

---

## 🚀 Getting Started

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Spin up the development server:
   ```bash
   npm run dev
   ```

3. Compile the production build:
   ```bash
   npm run build
   ```

---

## 📱 Responsiveness Guidelines

- **Desktop**: Persistent side panel with high-density grid widgets.
- **Tablet**: Flexible container modules with scrollable tables.
- **Mobile**: Dynamic float triggers, collapsible hamburger drawer menus, and sticky confirmation cards.
