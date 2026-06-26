# LIMS Project Backlog

This backlog file contains the planned features, user interface changes, and bug fixes to be implemented in the laboratory information management system (LIMS).

## Current Task List

### 1. Flag Swap on Language Selector
*   **Description**: Currently, selecting English (EN) displays the Israeli flag, and selecting Hebrew (HE) displays the US flag.
*   **Fix**: Swap the flags so that English (EN) displays the US/UK flag and Hebrew (HE) displays the Israeli flag.

### 2. Task/Mission Assignment ("Assign Mission")
*   **Description**: Enable the Manager to assign specific batches or shipments to one or more technicians.
*   **Details**:
    *   Managers can see pending shipments.
    *   Managers can select one or more technicians from a list and assign the shipment/batch to them.
    *   Technicians should see only their assigned missions or have a clear indication of tasks assigned to them on their dashboard.

### 3. Test Inputs & Result Matching Mockups
*   **Description**: Create mockups and verify the entry form for all test types in the system.
*   **Goal**: Ensure it's easy and intuitive for technicians to input results, and verify that the output results match the specifications correctly.

### 4. Color Palette Refinement (Soft Earthy Tone Theme)
*   **Description**: Change the visual theme from the current high-contrast, neon-blue aesthetic to a softer, calmer color palette.
*   **Palette direction**: Soft sage greens, warm browns, and light grayish/off-white backgrounds to reduce visual fatigue.

### 5. Manager Dashboard Layout Refactor
*   **Description**: Clean up the main view of the Manager Portal.
*   **Details**:
    *   Remove the "Incubation Actions Required" section from the manager view (it is no longer a priority for managers).
    *   In its place, display "Pending Shipments" showing batches awaiting assignment or analysis.
    *   Integrate the "Assign Mission" feature directly into this section.
