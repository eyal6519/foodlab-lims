# 🧪 Food Laboratory LIMS Portal

A modern, mobile-responsive **Laboratory Information Management System (LIMS)** designed specifically for food quality control laboratories (Food Examination & Stock Quality מדור בחינת מזון וטיב המלאי).

The system enables real-time tracking of incoming shipments, batch testing calculations, quality spec verification, incubation period management, automatic COA signing, and database storage tracking.

---

## 🎯 Application Goals
- **Eliminate Paperwork**: Transition lab records from manual logs to a secure, digital portal.
- **Automate Calculations**: Perform complex food safety formulas automatically (e.g. logarithmic pH averaging, moisture, acidity, ash, peroxide values, specific gravity, and tare subtractions) to eliminate human error.
- **Ensure Quality Standard Compliance**: Automatically validate test values against product-specific limits and flag out-of-spec parameters visually.
- **Manage Incubation Cycles**: Track active incubation runs (36°C & 55°C) with automated timers, alerts, and access guards.
- **Deploy Certificates Instantly**: Generate signed Certificate of Analysis (COA) sheets immediately upon batch approval, ready for printing or downloading.

---

## 📖 User Guides & Documentation

To learn how to operate the portal under different roles, refer to the step-by-step user guides:
- [**מדריך למשתמש בעברית (Hebrew User Guide)**](USER_GUIDE_HE.md)
- [**English User Guide**](USER_GUIDE_EN.md)

---

## 🛠️ Tech Stack & Database Schema

- **Frontend**: React + Vite + Vanilla CSS (Sage Green & Warm Clay earthy theme) + Lucide Icons.
- **Backend/DB**: Supabase (PostgreSQL with RLS policy guards).

### Database Initialization
Schema changes are managed through the Supabase CLI using versioned migrations in [`supabase/migrations/`](supabase/migrations/). To apply them to a linked project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push --dry-run   # verify the plan first
supabase db push
```

[**schema.sql**](schema.sql) is retained as a **reference snapshot** of the full database structure — a single-file description of every table, trigger, function, and RLS policy. It documents what exists but is no longer the mechanism for shipping changes. Applying it by hand can silently skip statements, which previously caused a missing `batches.submitted_at` column and `PGRST204` API errors. Add new schema changes as migrations instead.
