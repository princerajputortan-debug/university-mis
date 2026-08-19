CREATE TABLE IF NOT EXISTS `consolidated_payout` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `enrollment_id` INT NOT NULL,
  `lead_source_code` INT NULL,
  `payout_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `invoice_no` VARCHAR(255) NULL,
  `payout_month` VARCHAR(20) NULL,
  `category` VARCHAR(100) NULL,
  `commission_pct` DECIMAL(5,2) NULL,
  `doa` DATETIME NULL,
  `reco_status` VARCHAR(50) NULL,
  `released_on` DATE NULL,
  `remarks` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_consolidated_payout_enrollment_id` (`enrollment_id`),
  KEY `idx_consolidated_payout_lead_source_code` (`lead_source_code`),
  KEY `idx_consolidated_payout_month` (`payout_month`),
  CONSTRAINT `fk_consolidated_payout_enrollment`
    FOREIGN KEY (`enrollment_id`) REFERENCES `Enrollment`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
