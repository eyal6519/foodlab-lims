# LIMS Project Backlog

This document tracks all planned, in-progress, and completed features for the LIMS React Application. It is stored in the root of the repository to ensure it is always accessible across all machines and sessions.

---

## 📋 Planned / Proposed Features

### Short-Term & User Interface
- [x] **Test Inputs & Result Matching Mockups**
  - *Description:* Created mockups and verified the entry form for all test types in the LIMS.
  - *Goal:* Ensure intuitive data entry for technicians and confirm output results map to specifications correctly.
- [ ] **Smart Numeric Keypad for Mobile**
  - *Description:* Force numeric keypads with `inputMode="decimal"` for gloved technicians entering numbers on mobile.
- [ ] **Auto-Select Input Text on Focus**
  - *Description:* Automatically select the entire text when a number input is focused, preventing cursor misalignment and trailing zeros (e.g., typing '5' over '0' creating '50').
- [ ] **Unsaved Changes Warning Modal**
  - *Description:* Prompt technicians with a confirmation check if they try to leave the entry page with unsaved replicates.
- [ ] **Higher Contrast Compliance Badges**
  - *Description:* Make status indicators larger with distinct symbols ($\checkmark$ / $\times$) for better readability under bright lab lights.
- [ ] **Quick-Access Draft Banner**
  - *Description:* Display a dashboard shortcut for technicians to quickly resume active test entry drafts.

### Long-Term / Complex Features
- [x] **Database Cleanup and Data Archiving Tool**
  - *Reason:* Automatically or manually purge or archive historical records to remain within free-tier Supabase and Vercel storage limits.
- [ ] **Retest Audit Trail & History Log**
  - *Reason:* Keep a permanent record of previous retest reasons and rejection dates for audit compliance.
- [ ] **Specialized Quality Assurance Mock Testing**
  - *Reason:* Ensure that chemical equations and other testing methodologies are mathematically verified against benchmark standard values.
- [x] **Ratio and Composite Parameter Equations**
  - *Reason:* Automatically calculate parameters that depend on the mathematical relationship between different test results (e.g. moisture-to-protein ratio).

---

## ⚙️ Features Under Discussion / Refining


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
- [x] **Database Cleanup and Data Archiving Tool**
  - *Description:* Implemented manual COA deletion from the Archive and automatic background database size monitoring. The system alerts managers when storage usage exceeds 75% and automatically purges the oldest 30% of signed COAs when usage reaches 90% to stay within the free-tier Supabase limit.
- [x] **Delete Product Template**
  - *Description:* Enabled managers to delete product templates from the template list, preventing deletion if active shipments rely on that template.
- [x] **General Notifications Center**
  - *Description:* Upgraded the incubation notification bell into a comprehensive notification center, adding alerts for retest requests, active assignments, and database storage warnings.
- [x] **Tare Registry (Saved Tares)**
  - *Description:* Added a Saved Tares database table (`tare_registry`) and modals (📋 for Load, 💾 for Save) next to the weight test input. Supports real-time text searching, matching supplier indicators, and Base64 device camera capture and file uploads for visual comparison.
- [x] **Mobile PWA & Mobile QA Panel Override**
  - *Description:* Enabled force-rendering the QA control panel on production/mobile environments using the `?qa=true` query parameter, facilitating live mobile demo setups using Progressive Web App (PWA) "Add to Home Screen" behaviors.
