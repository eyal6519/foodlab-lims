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
The database table structures, triggers, security functions, and RLS policies are documented in [**schema.sql**](schema.sql). When setting up a new environment, copy and execute the SQL script in your Supabase SQL Editor.
