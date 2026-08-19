#!/usr/bin/env python3
"""
Fast bulk payment CSV import using SQLAlchemy + MySQL upsert.

Usage:
  pip install -r requirements.txt
  python scripts/import_payment_bulk.py jodo "path/to/file.csv"

Supports: jodo, razorpay, early, offline, bank, propelld, others
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import quote_plus, unquote, urlparse

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

PAYMENT_TABLES = {
    "razorpay": ("RazorpayPayment", "Razorpay"),
    "jodo": ("JodoPayment", "Jodo"),
    "early": ("EarlyPayment", "Early"),
    "offline": ("OfflinePayment", "Offline"),
    "bank": ("BankPayment", "Bank"),
    "propelld": ("PropelldPayment", "Propelld"),
    "others": ("OthersPayment", "Others"),
}

CHUNK_SIZE = 2000


def prisma_url_to_sqlalchemy(url: str) -> str:
    """mysql://user:pass@host:port/db -> mysql+pymysql://..."""
    if url.startswith("mysql+pymysql://"):
        return url
    if not url.startswith("mysql://"):
        raise ValueError("DATABASE_URL must be a mysql:// connection string")
    return "mysql+pymysql://" + url[len("mysql://") :]


def parse_date(value) -> datetime | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    s = str(value).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s.split()[0], fmt)
        except ValueError:
            continue
    return None


def parse_float(value) -> float:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return 0.0
    s = str(value).strip().replace(",", "")
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_int_optional(value) -> int | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def first_col(row: pd.Series, *names: str):
    for name in names:
        if name in row.index:
            val = row[name]
            if pd.notna(val) and str(val).strip() != "":
                return val
    return None


def load_reference_maps(engine: Engine) -> tuple[set[int], dict[int, int | None]]:
    with engine.connect() as conn:
        enroll_rows = conn.execute(text("SELECT id FROM Enrollment")).fetchall()
        valid_ids = {int(r[0]) for r in enroll_rows}

        batch_rows = conn.execute(
            text(
                "SELECT enrollmentId, batchId FROM AdmissionForm WHERE enrollmentId IS NOT NULL"
            )
        ).fetchall()
        batch_map = {int(r[0]): (int(r[1]) if r[1] is not None else None) for r in batch_rows}
    return valid_ids, batch_map


def normalize_csv(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    tx_col = None
    for c in df.columns:
        if "transaction" in c.lower() or "utr" in c.lower():
            tx_col = c
            break
    if tx_col is None:
        raise ValueError("CSV must include a Transaction ID / UTR column")

    df["_tx"] = df[tx_col].astype(str).str.strip()
    df = df[df["_tx"].ne("") & df["_tx"].ne("nan")]
    df = df.drop_duplicates(subset=["_tx"], keep="last")
    return df


def build_records(
    df: pd.DataFrame, valid_enrollment_ids: set[int], batch_map: dict[int, int | None]
) -> tuple[list[dict], int]:
    records: list[dict] = []
    skipped = 0

    for _, row in df.iterrows():
        tx = row["_tx"]
        enroll_raw = first_col(
            row,
            "enrollment_id",
            "enrollmentId",
            "Enrollment_Id",
            "Enrollment_No",
            "Enrollment No",
        )
        if enroll_raw is None:
            skipped += 1
            continue

        enroll_s = str(enroll_raw).strip()
        enrollment_id = None
        if enroll_s.lower() == "reco":
            enrollment_id = None
        elif re.fullmatch(r"\d+", enroll_s):
            eid = int(enroll_s)
            enrollment_id = eid if eid in valid_enrollment_ids else None
        else:
            enrollment_id = None

        amount = parse_float(
            first_col(row, "Transaction Amount (₹)", "Transaction Amount", "Amount", "amount")
        )
        discounted = parse_float(first_col(row, "Discounted Course Fee"))
        first_emi = parse_float(first_col(row, "1st EMI"))
        tenure = parse_int_optional(first_col(row, "tenure", "Tenure"))
        mode_val = first_col(row, "Mode", "mode")
        mode = str(mode_val).strip() if mode_val is not None else None
        date_val = parse_date(first_col(row, "Date", "date", "Payment Date"))

        records.append(
            {
                "transactionId": tx,
                "date": date_val,
                "enrollmentId": enrollment_id,
                "amount": amount,
                "mode": mode,
                "batchId": batch_map.get(enrollment_id) if enrollment_id else None,
                "discountedCourseFee": discounted if discounted else None,
                "firstEmi": first_emi if first_emi else None,
                "tenure": tenure,
            }
        )

    return records, skipped


def bulk_upsert_payment_table(
    engine: Engine, table: str, records: list[dict]
) -> int:
    if not records:
        return 0

    sql = text(
        f"""
        INSERT INTO `{table}` (
          transactionId, `date`, enrollmentId, amount, mode, batchId,
          discountedCourseFee, firstEmi, tenure, createdAt, updatedAt
        ) VALUES (
          :transactionId, :date, :enrollmentId, :amount, :mode, :batchId,
          :discountedCourseFee, :firstEmi, :tenure, NOW(), NOW()
        )
        ON DUPLICATE KEY UPDATE
          `date` = VALUES(`date`),
          enrollmentId = VALUES(enrollmentId),
          amount = VALUES(amount),
          mode = VALUES(mode),
          batchId = VALUES(batchId),
          discountedCourseFee = VALUES(discountedCourseFee),
          firstEmi = VALUES(firstEmi),
          tenure = VALUES(tenure),
          updatedAt = NOW()
        """
    )

    total = 0
    with engine.begin() as conn:
        for i in range(0, len(records), CHUNK_SIZE):
            chunk = records[i : i + CHUNK_SIZE]
            conn.execute(sql, chunk)
            total += len(chunk)
            print(f"  {table}: {min(i + CHUNK_SIZE, len(records))} / {len(records)}")
    return total


def bulk_upsert_consolidated(
    engine: Engine, records: list[dict], source_name: str
) -> int:
    if not records:
        return 0

    payload = [{**r, "sourceName": source_name} for r in records]
    sql = text(
        """
        INSERT INTO ConsolidatedPayment (
          transactionId, `date`, enrollmentId, amount, mode, batchId,
          discountedCourseFee, firstEmi, tenure, sourceName, createdAt, updatedAt
        ) VALUES (
          :transactionId, :date, :enrollmentId, :amount, :mode, :batchId,
          :discountedCourseFee, :firstEmi, :tenure, :sourceName, NOW(), NOW()
        )
        ON DUPLICATE KEY UPDATE
          `date` = VALUES(`date`),
          enrollmentId = VALUES(enrollmentId),
          amount = VALUES(amount),
          mode = VALUES(mode),
          batchId = VALUES(batchId),
          discountedCourseFee = VALUES(discountedCourseFee),
          firstEmi = VALUES(firstEmi),
          tenure = VALUES(tenure),
          sourceName = VALUES(sourceName),
          updatedAt = NOW()
        """
    )

    total = 0
    with engine.begin() as conn:
        for i in range(0, len(payload), CHUNK_SIZE):
            chunk = payload[i : i + CHUNK_SIZE]
            conn.execute(sql, chunk)
            total += len(chunk)
            print(f"  ConsolidatedPayment: {min(i + CHUNK_SIZE, len(payload))} / {len(payload)}")
    return total


def main() -> int:
    parser = argparse.ArgumentParser(description="Bulk import payment CSV to MySQL")
    parser.add_argument(
        "type",
        choices=sorted(PAYMENT_TABLES.keys()),
        help="Payment source type",
    )
    parser.add_argument("csv_path", help="Path to payment CSV file")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and validate only; do not write to database",
    )
    args = parser.parse_args()

    csv_path = Path(args.csv_path)
    if not csv_path.exists():
        print(f"File not found: {csv_path}", file=sys.stderr)
        return 1

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not set in .env", file=sys.stderr)
        return 1

    table_name, source_label = PAYMENT_TABLES[args.type]
    engine = create_engine(
        prisma_url_to_sqlalchemy(db_url),
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )

    print(f"Reading {csv_path.name}...")
    df = pd.read_csv(csv_path, dtype=str, keep_default_na=True)
    df = normalize_csv(df)
    print(f"Unique transactions in CSV: {len(df)}")

    valid_ids, batch_map = load_reference_maps(engine)
    records, skipped = build_records(df, valid_ids, batch_map)
    print(f"Valid rows: {len(records)}, skipped: {skipped}")

    if args.dry_run:
        print("Dry run complete — no database writes.")
        return 0

    print(f"Uploading to {table_name} + ConsolidatedPayment...")
    bulk_upsert_payment_table(engine, table_name, records)
    bulk_upsert_consolidated(engine, records, source_label)

    with engine.connect() as conn:
        count = conn.execute(text(f"SELECT COUNT(*) FROM `{table_name}`")).scalar()
    print(f"Done. {table_name} total rows: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
