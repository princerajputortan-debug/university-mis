# Software reference schema (from zip export)

Reference CSVs live in `prisma/reference-data/` (from `Software-*.csv`).

## Master: enrollment number (text only here)

| File | Prisma model | Columns |
|------|----------------|---------|
| `Software-enrollment_id.csv` | `Enrollment` | `id`, `enrollment` (e.g. `UGL202232994`) |

## Main admission row (all FKs are numeric ids)

| Reference column | Prisma `AdmissionForm` field | Lookup table |
|------------------|------------------------------|--------------|
| `Sno` | `sno` | — |
| `Date_of_Admission` | `doa` | — |
| `Enrollment_No` | `enrollmentId` | → `Enrollment.id` (not the text code) |
| `Name` | `name` | — |
| `Batch` | `batchId` | `Batch` |
| `Payment_option` | `paymentOptionId` | `PaymentOption` |
| `Type` | `typeId` | `AdmissionType` |
| `Status` | `statusId` | `AdmissionStatus` |
| `Placed Status` | `placedStatusId` | `PlacementStatus` |
| `Program` | `programId` | `Program` |
| `Lead_source` | `leadSourceId` | `LeadSource` |
| `Councellor` | `counselor` | — (free text) |
| `Team` | `teamId` | `Team` |
| `Bifurcation` | `bifurcationId` | `Bifurcation` |
| `Location` | `locationId` | `Location` |
| `nationality` | `nationalityId` | `Nationality` |
| `UGC_Status` | `ugcStatusId` | `UgcStatus` |
| `Adhar` | `aadhaar` | — |

File: `Software-main_data_base.csv`

## Lookup tables (fixed ids — seed before main import)

| CSV file | Model | Label column |
|----------|--------|--------------|
| `Software-program_id.csv` | `Program` | `program` |
| `Software-batch_id.csv` | `Batch` | `batch` |
| `Software-paymentoption_id.csv` | `PaymentOption` | `Paymentoption` |
| `Software-type_id.csv` | `AdmissionType` | `type` |
| `Software-status_id.csv` | `AdmissionStatus` | `status` |
| `Software-placement_id.csv` | `PlacementStatus` | `placed_status` |
| `Software-lead_source_id.csv` | `LeadSource` | `lead` |
| `Software-team_id.csv` | `Team` | `team` |
| `Software-bifurcation_id.csv` | `Bifurcation` | `bifurcation` |
| `Software-location_id.csv` | `Location` | `location` |
| `Software-nationality_id.csv` | `Nationality` | `nationality` (header may say `location`) |
| `Software-UGC_Status.csv` | `UgcStatus` | `ugcStatus` (header may say `location`) |

## Load order

```bash
npx prisma db push          # apply Prisma schema to MySQL
npm run seed:lookups        # all Software-*_id.csv lookups
npm run import:reference    # enrollments + main_data_base (~14k rows)
```

Test import on a subset:

```bash
set LIMIT=100
npm run import:reference
```

Payments still resolve enrollment **text** from gateways into `Enrollment`, then store `enrollmentId` on payment tables.
