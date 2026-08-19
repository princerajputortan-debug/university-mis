ALTER TABLE `consolidated_payout`
MODIFY COLUMN `category` ENUM('CP', 'DS', 'HP', 'Incentive', 'Referral', 'Others') NULL;
