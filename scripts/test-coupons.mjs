import {
  calculateCouponScholarships,
  orderCouponsForCalculation,
  COUPON_CATALOG,
} from '../src/lib/coupons.ts';

console.log('catalog count', COUPON_CATALOG.length);

const fees = [40000, 40000, 40000, 40000];
const scholarships = calculateCouponScholarships({
  maxSems: 4,
  semFees: fees,
  couponCodes: ['HP30OFF', 'ANNUAL5', 'RES3000'],
  student: { leadSource: 'General', paymentOption: 'Corporate' },
});
console.log('PG HP30+ANNUAL5+RES3000', scholarships);

const ordered = orderCouponsForCalculation(['RES3000', 'HP30OFF', 'ANNUAL5']).map(
  (c) => c.code
);
console.log('order', ordered);

const dsBlocked = calculateCouponScholarships({
  maxSems: 4,
  semFees: fees,
  couponCodes: ['CSC30'],
  student: { leadSource: 'Organic', paymentOption: 'Corporate' },
});
console.log('CSC blocked for general', dsBlocked);

const dsOk = calculateCouponScholarships({
  maxSems: 4,
  semFees: fees,
  couponCodes: ['DS-EARLYBIRDOFFER'],
  student: { paymentOption: 'Direct_Selling', team: 'Direct Selling' },
});
console.log('DS overall 10%', dsOk);
