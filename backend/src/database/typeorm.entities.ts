import { AuthenticationMetric } from '../authentication-metrics/entities/authentication-metric.entity';
import { Client } from '../clients/entities/client.entity';
import { Employee } from '../employees/entities/employee.entity';
import { InquiryAuditEntry } from '../inquiries/entities/inquiry-audit-entry.entity';
import { Inquiry } from '../inquiries/entities/inquiry.entity';
import { User } from '../users/entities/user.entity';
import { Setting } from '../settings/entities/setting.entity';
import {
  ConsignmentSchedule,
  ConsignmentScheduleItem,
} from '../consignment-schedules/entities/consignment-schedule.entities';
import {
  ConsignorPayment,
  ConsignorPaymentGroup,
  ConsignorPaymentItem,
} from '../consignor-payments/entities/consignor-payment.entities';
import {
  DirectPurchasePayment,
  DirectPurchasePaymentItem,
} from '../direct-purchase-payments/entities/direct-purchase-payment.entities';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { InventoryItemAuditEntry } from '../inventory/entities/inventory-item-audit-entry.entity';
import { ItemAuthentication } from '../inventory/entities/item-authentication.entity';
import { ItemAuthenticationMetric } from '../inventory/entities/item-authentication-metric.entity';
import { ItemPosting } from '../inventory/entities/item-posting.entity';
import { ItemPhotoshoot } from '../inventory/entities/item-photoshoot.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { ShopifyShopSession } from '../shopify/entities/shopify-shop-session.entity';
import { TablePreference } from '../table-preferences/entities/table-preference.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderAuditEntry } from '../orders/entities/order-audit-entry.entity';
import { OrderInstallment } from '../orders/entities/order-installment.entity';
import { OrderPayment } from '../orders/entities/order-payment.entity';
import { Waitlist } from '../orders/entities/waitlist.entity';
import { Media } from '../media/entities/media.entity';
import {
  Logistics,
  LogisticsItem,
} from '../logistics/entities/logistics.entities';
import {
  Promotion,
  PromotionItem,
} from '../promotions/entities/promotion.entities';
import { Voucher } from '../vouchers/entities/voucher.entity';
import { WalkInAuthentication } from '../walk-in-authentication/entities/walk-in-authentication.entity';
import { WalkInAuthenticationMetric } from '../walk-in-authentication/entities/walk-in-authentication-metric.entity';
import { FeatureAccess } from '../access-control/entities/feature-access.entity';
import { Task } from '../tasks/entities/task.entity';

export const TYPEORM_ENTITIES = [
  Inquiry,
  InquiryAuditEntry,
  User,
  Employee,
  Client,
  Setting,
  AuthenticationMetric,
  ConsignmentSchedule,
  ConsignmentScheduleItem,
  ConsignorPayment,
  ConsignorPaymentGroup,
  ConsignorPaymentItem,
  DirectPurchasePayment,
  DirectPurchasePaymentItem,
  InventoryItem,
  InventoryItemAuditEntry,
  ItemAuthentication,
  ItemAuthenticationMetric,
  ItemPosting,
  ItemPhotoshoot,
  Notification,
  ShopifyShopSession,
  TablePreference,
  Order,
  OrderAuditEntry,
  OrderInstallment,
  OrderPayment,
  Waitlist,
  Media,
  Logistics,
  LogisticsItem,
  Promotion,
  PromotionItem,
  Voucher,
  WalkInAuthentication,
  WalkInAuthenticationMetric,
  FeatureAccess,
  Task,
];
