# Standard Operating Procedure (SOP) - University MIS

## 1. Introduction
This document outlines the Standard Operating Procedures for utilizing the **University Management Information System (MIS)**. The MIS is designed to track student admission records, manage fee structures, consolidate payment tracking from multiple gateways, and automate fee deficiency calculations.

## 2. Access and Roles
### 2.1 Authentication
- **Accessing the Portal:** Navigate to the MIS portal (e.g., `http://localhost:3000`).
- **Roles:**
  - **ADMIN:** Has full write access. Can upload data, clear data, and modify admission forms.
  - **VIEWER:** Has read-only access. Can view dashboard metrics and admission form details but cannot make changes.

## 3. Dashboard Overview
The dashboard is the central hub of the MIS, providing real-time metrics:
- **Total Admission Forms:** Aggregate count of all students registered in the system.
- **Total Payment Records:** Count of all consolidated transactions processed across all gateways.
- **Total Fee Received:** The financial sum of all recorded payments.

> [!TIP]
> Use the "Quick Actions" on the dashboard to immediately jump to the Data Upload section or manage Admission Forms.

## 4. Bulk Data Upload (CSV)
The MIS supports automated bulk data ingestion to prevent manual data entry errors. As an ADMIN, navigate to **Data Upload** to process CSV files.

### 4.1 Fee Structure Upload
- **Type:** Select `Fee Structure` (`fee`).
- **Required Columns:** `batch`, `payment_option`, `program`, `sem_fee`.
- **Purpose:** Automatically establishes the expected "Fee as per Structure" for any student matching those criteria.

### 4.2 Admission Form Upload
- **Type:** Select `Admission Forms` (`form`).
- **Required Columns:** `enrollmentNo` / `EnrollmentNo`.
- **Optional Fields:** `doa` (Date of Admission), `type`, `program`, `batch`, `paymentOption`, `team`, `bifurcation`, `nationality`, `location`, `status`, `placedStatus`, `semFeeAfterDisc`. The importer intelligently supports Title Cased columns (e.g., `Team`, `Location`, `Payment Option`) for all fields.
- **Robust Date Parsing:** Date fields (`doa`, `DateOfAdmission`) are safely evaluated. Invalid date strings will gracefully fallback to empty instead of crashing the upload.
- **Purpose:** Bulk creation or updating of student profiles.

### 4.3 Payment Records Upload
- **Types:** Select from 7 payment sources: `Razorpay`, `Jodo`, `Early`, `Offline`, `Bank`, `Propelld`, `Others`.
- **Required Columns:** `Transaction ID` / `Settlement UTR` / `Transaction Id`, `Enrollment` / `enrollmentNo`.
- **Amount Columns:** `Transaction Amount (₹)`, `Amount`, or `amount`. The importer checks multiple capitalizations to prevent zero-value errors.
- **Purpose:** Uploads raw payment reports. The system automatically inserts records into source-specific tables and aggregates them into the **Consolidated Payment** engine.

> [!IMPORTANT]
> The system automatically cleans commas from monetary values during the upload process. However, ensure that the Enrollment Numbers perfectly match the ones in the Admission Forms to enable automatic fee reconciliation.

## 5. Managing Admission Forms
Navigate to **Forms** in the top navigation bar to access the student database.

### 5.1 Viewing, Searching, and Exporting
- The table displays high-level information: Enrollment No, Program, Batch, Total Fee, Recd Fee, Pending Fee, and Fee Category (Full Fee, Pending Fee, Excess Fee).
- **Placed Status:** Displays the placement status of the student.
- **Export Data:** Click the `Export Data` button to generate an Excel sheet. You must select a Date of Admission range. 
  - **Advanced Filters:** The export modal includes 9 optional filters (Program, Batch, Payment Option, Team, Bifurcation, Nationality, Location, Status, Placed Status) allowing you to precisely target the records you need.
- **UI Theme:** The entire application uses a modern, bright Light Mode with condensed typography for maximum professional readability.

### 5.2 Creating / Editing a Form
Click `+ New Admission Form` or `Edit` on an existing form. The form editor includes intelligent auto-calculations:

#### A. Basic Details & Logic Links
- **Type & Current Sem:** Selecting `UG` automatically sets Current Sem to `6`; `PG` sets it to `4`.
- **Team & Bifurcation:** The available `Bifurcation` options automatically filter based on the chosen `Team`.
- **Nationality & Location:** Selecting `Indian` populates the Location dropdown with Indian States. Selecting `Others` populates it with global countries.

#### B. Fee Calculations (Auto-Computed)
- **Fee as per Structure (Auto):** Automatically fetched from the Fee Structure table when Batch, Payment Option, and Program are selected.
- **Scholarship (Auto):** Calculated as `Fee as per Structure` minus `Sem Fee after Disc. (Manual)`.
- **Total Fee (Auto):** Calculated as `Current Sem` × `Fee as per Structure`.
- **Recd Fee (Auto):** System scans the Consolidated Payment tables for the student's `Enrollment No` and sums the total amount.
- **Pending Fee (Auto):** `Total Fee` minus `Recd Fee`.
- **Category (Auto):** Automatically categorizes as `Full Fee`, `Pending Fee`, or `Excess Fee` based on the mathematical outcome.

#### C. Payment Tracking Fields
- **Mode of Payment (Auto-Fetched):** This field cannot be manually edited. The system automatically inspects the payment aggregator tables and generates a comma-separated list of sources (e.g., `Razorpay, Jodo`) where the student has recorded transactions.
- **Placed Status:** Manually track the student's placement journey (Optout, Placed, Interviewed – Not Selected, Not Eligible, Pending to Place).

## 6. Data Management and Cleanup
If payment records become corrupt or test data needs to be wiped:
- Authorized admins can use the **Clear Tracker Data** API endpoints or UI tools (if implemented in the dashboard) to selectively wipe records from specific payment sources or the entire consolidated table, allowing for fresh CSV uploads.

> [!CAUTION]
> Clearing payment records will immediately affect the `Recd Fee` and `Pending Fee` auto-calculations for all associated admission forms. Do this only when performing a full database refresh.
