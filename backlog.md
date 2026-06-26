# LIMS Project Backlog

This document tracks all planned, in-progress, and completed features for the LIMS React Application. It is stored in the root of the repository to ensure it is always accessible across all machines and sessions.

---

## 📋 Planned / Proposed Features

### Short-Term & User Interface
- [x] **Test Inputs & Result Matching Mockups**
  - *Description:* Created mockups and verified the entry form for all test types in the LIMS.
  - *Goal:* Ensure intuitive data entry for technicians and confirm output results map to specifications correctly.

### Long-Term / Complex Features
- [ ] **Database Cleanup and Data Archiving Tool**
  - *Reason:* Automatically or manually purge or archive historical records to remain within free-tier Supabase and Vercel storage limits.
- [ ] **Specialized Quality Assurance Mock Testing**
  - *Reason:* Ensure that chemical equations and other testing methodologies are mathematically verified against benchmark standard values.
- [x] **Ratio and Composite Parameter Equations**
  - *Reason:* Automatically calculate parameters that depend on the mathematical relationship between different test results (e.g. moisture-to-protein ratio).

---

## ⚙️ Features Under Discussion / Refining
- [ ] **Mobile APK Build Setup (Capacitor) & Mobile QA Panel**
  - *Reason:* Compile the web application into a mobile Android APK for on-phone demos, and support URL parameter overrides (e.g. `?qa=true`) to force-enable the QA Panel on mobile devices.

---

## ✅ Completed Features

- [x] **Full Hebrew UI Localization**
  - *Description:* Translated all user-facing strings across the entire application (login, shipment modal, batch testing page, replicate modal, manager view, technician view, COA document, toasts, and all test names) into Hebrew. Implemented a language switcher with flag toggle persisted to localStorage.
- [x] **Task/Mission Assignment & Manager Dashboard Refactor**
  - *Description:* Allow managers to assign shipments to specific technicians. Cleaned up the manager overview to show pending assignments, and added a "My Missions Only" toggle to the technician workspace.
- [x] **Language Flag Fix (Flag Swap)**
  - *Description:* Corrected the flags in the language selector (swapped English/Hebrew flag displays).
- [x] **Color Palette Refinement (Soft Earthy Tone Theme)**
  - *Description:* Transitioned the global layout from a high-contrast dark neon aesthetic to a calmer, warmer light earthy theme (sage greens and warm clays).
- [x] **Mobile-Responsive UI Layout**
  - *Description:* Updated the shell and core views to render responsively across mobile, tablet, and desktop viewports.
- [x] **Global Incubation Exit Notifications and Timers**
  - *Description:* Implemented live countdown timers for active incubation runs, header status bells, and background periodic check intervals triggering system-level browser notifications.
- [x] **Technician Name Provisioning**
  - *Description:* Managers can set a technician's name during account creation, showing up dynamically in headers and user profiles.
- [x] **Friendly Login Error Toasts**
  - *Description:* Replaced basic window alerts with descriptive, LIMS-centric error notifications for wrong credentials, server/database offline, and missing environment variables.
- [x] **Capitalization of Units**
  - *Description:* Wrapped unit symbols (like `(g)`) in `normal-case` tags so they are not forced into uppercase styles.
- [x] **Incubation Setting UI Guard**
  - *Description:* Hides incubation duration setup inputs when incubation days are set to 0 in product templates.
- [x] **Logarithmic pH Average Calculation**
  - *Description:* Implemented proper logarithmic pH averaging instead of arithmetic averaging, supported by unit tests.
- [x] **Product Template Search and Filters**
  - *Description:* Implemented full search and filter controls for managers.
- [x] **Read-Only Template View for Technicians**
  - *Description:* Technicians can view templates and search them, without delete or edit options.
- [x] **Per-Batch Unit and Incubation Quantity Tracking**
  - *Description:* Enabled tracking individual batch packaging counts and cycle times inside a single shipment.
- [x] **Dedicated Batch Testing Page**
  - *Description:* Built a full-screen results entry screen for entering replicates for all batch parameters simultaneously.
- [x] **Remove Replicate Limit on Net Weight**
  - *Description:* Enabled inputting unlimited replicates for net weight tests.
- [x] **Single Tare Input & Subtraction Switch (Weight Test)**
  - *Description:* Allows technicians to input a single tare weight once and toggle automatic subtraction.
- [x] **Detailed Weight Breakdown on COA Certificate**
  - *Description:* Expanded the COA results view into three sub-rows (Average Gross, Tare, and Average Net).
- [x] **Show Individual Replicate Results on COA Certificate**
  - *Description:* Displays all entered replicate values centered on the COA sheet with the final average highlighted in bold on the right.
- [x] **COA Search and Filtering**
  - *Description:* Filter certificates by template name, batch number, production date range, or approval date range.
