# 📋 User Guide — LIMS Portal for Food Lab Quality Control

> This guide is intended for the laboratory team: both Administrators/Managers and Technicians.  
> The system supports both Hebrew and English — toggle languages by clicking the flag button in the top-right corner of the screen.

---

## 📑 Table of Contents

1. [System Entry & Login](#1-system-entry--login)
2. [Roles & Permissions](#2-roles--permissions)
3. [Manager Guide](#3-manager-guide)
   - [Dashboard](#31-dashboard)
   - [Product Templates](#32-product-templates)
   - [Shipment Intake](#33-shipment-intake)
   - [Incubation Chamber](#34-incubation-chamber)
   - [Review & Approval](#35-review--approval)
   - [Recent Certificates (COA)](#36-recent-certificates-coa)
   - [Archive](#37-archive)
   - [User Management](#38-user-management)
4. [Technician Guide](#4-technician-guide)
   - [Pending Tasks](#41-pending-tasks)
   - [Entering Test Results](#42-entering-test-results)
   - [Incubating Batches](#43-incubating-batches)
   - [Archive & Printing](#44-archive--printing)
5. [Incubation Alerts & Notifications](#5-incubation-alerts--notifications)
6. [Storage Management](#6-storage-management)
7. [FAQ & Troubleshooting](#7-faq--troubleshooting)

---

## 1. System Entry & Login

1. Open the portal URL in your web browser.
2. Enter your **email address** and the **password** assigned by your Laboratory Administrator.
3. Click **"Sign In"**.

> **Note:** If your account has not yet been assigned a role, you will see an "Access Pending" notice. Please contact your manager.

---

## 2. Roles & Permissions

| Role | Capabilities |
|---|---|
| **Manager** | Full administrative rights: templates config, shipment intake, sign and approve COAs, user roles management, mission assignment |
| **Technician** | General lab work: view templates, enter batch test results, print/download COAs |

---

## 3. Manager Guide

Upon logging in, you will access the **Manager Dashboard**. Use the sidebar navigation menu to switch tabs.

---

### 3.1 Dashboard

Displays a live summary of the laboratory status:
- **Pending Review** — Batches awaiting manager signature or testing completion.
- **In Incubation** — Number of batches currently inside incubators.
- **Database Storage** — Progress bar indicating current storage usage out of 500 MB.
- **Pending Shipments & Assignments** — Shipment list with option to assign technicians.

#### Assigning a Mission to a Technician
1. On the dashboard, locate the target shipment.
2. Click **"Assign Mission"**.
3. Select one or more technicians from the list.
4. Click **"Save Assignment"**.

The technician will see this shipment highlighted under their "My Missions Only" filter.

---

### 3.2 Product Templates

A product template defines **which tests** apply to each product and their corresponding **specifications** (min, max, or range limits).

#### Creating a New Product Template
1. Go to the **"Product Templates"** tab.
2. Click **"Create Template"**.
3. Fill in:
   - **Product Name** (Required) — e.g. "Canned Tuna in Vegetable Oil".
   - **Requires Incubation Workflow** — Toggle active if the product undergoes incubation, and specify incubation duration for 36°C and/or 55°C chambers.
4. **Select Tests**: Check the tests that apply. For each test, optionally define:
   - **Min Threshold** — Minimum acceptable value.
   - **Max Threshold** — Maximum acceptable value.
5. **Add Custom Test** (Optional):
   - Enter custom test name and unit.
   - Select **"Single Value"** (direct measurement) or **"Ratio Test"** (numerator/denominator formula).
   - Click **"Add Test"**.
6. Click **"Save Template"**.

---

### 3.3 Shipment Intake

#### Registering a New Shipment
1. Navigate to the **"Shipment Intake"** tab.
2. Click **"Intake Shipment"**.
3. Fill in:
   - **Product** — Select from your templates list.
   - **Supplier** — Supplier name.
   - **Intake Date** — Lab arrival date.
   - **Packaging Size** — e.g. 140 g, 960 g, 1 L.
4. **Add Batches**: Click **"Add Batch"** for each batch and specify:
   - **Batch Number** — Format YY-JJJ (e.g. 26-168).
   - **Production & Expiry Dates**.
   - **Incubation Units** — Specify number of units placed in 36°C and/or 55°C incubators (if applicable).
5. Click **"Save Log"**.

---

### 3.4 Incubation Chamber

Displays all batches currently undergoing incubation.
- **Countdown** — Displays days remaining until incubation is complete.
- **"Exits Today"** / **"Exits Tomorrow"** — Status indicators.
- **"Ready for Exit 🔔"** — Incubation time reached. 

When a batch is ready to exit:
1. Click **"Unlock / Override"** on the batch card.
2. This unlocks the tests dependent on incubation (e.g., pH/Vacuum after incubation) on the technician's testing page.

---

### 3.5 Review & Approval

Displays batches submitted by technicians for review.

#### Approving a Batch
1. Locate the batch under **"Review & Approval"**.
2. Review the entered replicates.
3. Click **"Approve & Sign Certificate"**.
4. The Certificate of Analysis (COA) is digitally signed and saved.

#### Declining and Requesting a Retest
1. Click **"Decline & Request Retest"**.
2. Enter the **retest reason**.
3. Click **"Submit Request"**.
4. The technician will receive an alert to re-run the tests.

#### Result Color Codes
- ✅ **Green** — Replicate average complies with specs.
- ❌ **Red** — Replicate average is out of spec limits.
- ⏳ **Gray** — Replicates not yet entered.

---

### 3.6 Recent Certificates (COA)

Displays **COAs approved in the last 24 hours**.
- Search and filter by product template, batch, approval date, production date, or intake date.
- Click **"View COA"** to open the certificate.
- Print directly or click **"Download PDF"** to save to your local device.

---

### 3.7 Archive

Displays **all** previously approved COAs (older than 24 hours).
- Provides identical searching, filtering, and printing options.
- **Delete COA**: Click the red button to delete test data and free up database storage.
  - ⚠️ This action **cannot be undone**.

---

### 3.8 User Management

#### Adding a Lab Technician
1. Go to the **"User Accounts"** tab.
2. Fill in: Name, Email, and initial Password.
3. Click **"Create Account"**.

#### Modifying Roles & Deleting Users
- Toggle user role using the **"Set as Manager"** / **"Set as Technician"** button.
- Click **"Delete"** to revoke access and delete account profile records.

---

## 4. Technician Guide

After logging in, you will access the **Technician Dashboard**.

---

### 4.1 Pending Tasks

- Filter using **"My Missions Only"** to focus on shipments assigned to you by the manager.
- Click **"Enter Results"** (or **"Edit Results"**) on any shipment card to open the test forms page.

---

### 4.2 Entering Test Results

#### Step-by-Step Data Entry
1. Process tests top-to-bottom.
2. Click **"Add Replicate"** to add multiple measurements.
3. Input raw readings — the average calculated results update automatically.
4. Click **"Save Results"** once all tests are completed.

#### Weight Test & Saved Tares Registry (Tare Registry)
- **Default Batch Tare**: Enter the tare weight once to apply it across replicates.
- **Load Saved Tare (📋)**: Instead of weighing the tare container again, click the 📋 button next to the tare field to load a saved tare for this product template.
  - Tares matching the current supplier will have a green background and a `Matched Supplier` badge.
  - Click on the image thumbnail to open a full-screen image preview to verify the container structure visually.
- **Save Tare to Registry (💾)**: When you enter a tare value, the 💾 button appears. Click it to save the tare for future use:
  - Fill in the required fields: Short Description (e.g. small white cup with field drawing) and Declared Weight.
  - Optional fields: Manufacturer and Photo (capture using mobile camera or upload an image).
- Toggle **"Subtract Tare from Measured Weight"** to enter Gross readings and automatically calculate Net.

---

### 4.3 Incubating Batches

- Displays batches currently in incubation.
- Tests related to incubation are locked (🔒) until the incubation countdown finishes and the manager unlocks them.

---

### 4.4 Archive & Printing

- Search, view, print, or download past COAs.

---

## 5. Incubation Alerts & Notifications

The bell button 🔔 is located in the main navigation bar.
- Red badge: Active notifications.
- Click a notification card to dismiss it.
- **Alert Types**:
  - 🟡 **Incubation Complete**: A batch has finished incubation and requires unlocking.
  - 💾 **Storage Alert**: Storage has reached 75%+ and will automatically clear oldest records at 90%.

---

## 6. Storage Management

The system operates on a free-tier database with a **500 MB** limit.
- **Auto-Cleanup**: If storage usage hits **90%**, the system automatically purges the oldest 30% of approved COAs.
- **Manual Cleanup**: Delete old records in the manager **Archive** using the red "Delete COA" button.

---

## 7. FAQ & Troubleshooting

**Q: I see an "Access Pending" message after signing in?**  
A: Your account has been registered, but the manager has not yet set your role. Please contact your manager.

**Q: Why are incubation tests locked?**  
A: Incubation-dependent tests remain locked until the incubation period finishes and the manager unlocks them.

**Q: I cannot save my test results?**  
A: Check for validation warnings (red inputs). All error warnings must be corrected before submitting results.

**Q: Can I retrieve a deleted COA?**  
A: No. Deletions are permanent. Please download PDFs of important documents before purging them.

---

*LIMS System — Food Examination & Quality Control Laboratory*  
*Version: June 2026*
